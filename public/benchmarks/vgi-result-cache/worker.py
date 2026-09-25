# /// script
# requires-python = ">=3.13"
# dependencies = ["vgi-python==0.37.1", "vgi-rpc==0.47.0", "pyarrow==25.0.1"]
# ///
"""Synthetic, deterministic workloads for the VGI result-cache article.

The table's 50 ms sleep and streaming map's 5 ms sleep model waiting on an
upstream service. They are not measurements of a real API or model.
"""

import hashlib
import importlib.metadata
import json
import platform
import sys
import time
from dataclasses import dataclass
from typing import Annotated, cast

import pyarrow as pa
import pyarrow.compute as pc

from vgi import Arg, Param, Returns, ScalarFunction, Worker
from vgi.arguments import TableInput
from vgi.cache_control import CacheControl
from vgi.catalog import Catalog, Schema
from vgi.invocation import BindResponse
from vgi.protocol import VgiOutputCollector
from vgi.table_function import TableFunctionGenerator, bind_fixed_schema, init_single_worker
from vgi.table_in_out_function import RowTransformFunction, TableInOutGenerator


def costly(values):
    """A real CPU workload: 300 PBKDF2-HMAC-SHA256 iterations per input value."""
    return pa.array([
        int.from_bytes(hashlib.pbkdf2_hmac(
            "sha256", str(v).encode(), b"vgi-cache-benchmark", 300, dklen=8
        ), "little") & ((1 << 63) - 1)
        for v in values.to_pylist()
    ], type=pa.int64())


@dataclass(frozen=True, kw_only=True)
class TableArgs:
    n: Annotated[int, Arg(0)]
    delay_ms: Annotated[int, Arg(1)]


@bind_fixed_schema
@init_single_worker
class Numbers(TableFunctionGenerator[TableArgs, None]):
    FIXED_SCHEMA = pa.schema([("x", pa.int64())])

    class Meta:
        name = "numbers"

    @classmethod
    def process(cls, params, state, out):
        time.sleep(params.args.delay_ms / 1000)
        batch = pa.record_batch({"x": pa.array(range(params.args.n), type=pa.int64())})
        cast(VgiOutputCollector, out).emit(batch, cache_control=CacheControl(ttl=3600))
        out.finish()


class DoubleScalar(ScalarFunction):
    CACHE_CONTROL = CacheControl(ttl=3600, per_value=True)

    class Meta:
        name = "double_scalar"

    @classmethod
    def compute(cls, x: Annotated[pa.Int64Array, Param()]) -> Annotated[pa.Int64Array, Returns()]:
        return pc.multiply(x, 2)


class CostlyScalar(ScalarFunction):
    CACHE_CONTROL = CacheControl(ttl=3600, per_value=True)

    class Meta:
        name = "costly_scalar"

    @classmethod
    def compute(cls, x: Annotated[pa.Int64Array, Param()]) -> Annotated[pa.Int64Array, Returns()]:
        return costly(x)


@dataclass(frozen=True, kw_only=True)
class StreamArgs:
    data: Annotated[TableInput, Arg(0)]
    delay_ms: Annotated[int, Arg("delay_ms")]


class Echo(TableInOutGenerator[StreamArgs]):
    class Meta:
        name = "echo"

    @classmethod
    def on_bind(cls, params):
        return BindResponse(output_schema=params.bind_call.input_schema)

    @classmethod
    def process(cls, params, state, batch, out):
        if params.args.delay_ms:
            time.sleep(params.args.delay_ms / 1000)
        cast(VgiOutputCollector, out).emit(batch, cache_control=CacheControl(ttl=3600))


@dataclass(frozen=True, kw_only=True)
class MapArgs:
    x: Annotated[int, Arg(0)]


class CostlyRows(RowTransformFunction[MapArgs]):
    class Meta:
        name = "costly_rows"

    @classmethod
    def on_bind(cls, params):
        return BindResponse(output_schema=pa.schema([("y", pa.int64())]))

    @classmethod
    def process(cls, params, state, batch, out):
        cast(VgiOutputCollector, out).emit(
            pa.record_batch({"y": costly(batch.column("x"))}),
            cache_control=CacheControl(ttl=3600, per_value=True),
        )


class BenchmarkWorker(Worker):
    catalog = Catalog(name="cache_bench", schemas=[Schema(
        path=["main"], functions=[Numbers, DoubleScalar, CostlyScalar, Echo, CostlyRows]
    )])


if __name__ == "__main__":
    if "--benchmark-env" in sys.argv:
        print(json.dumps({"python": platform.python_version(), **{
            name: importlib.metadata.version(name)
            for name in ["vgi-python", "vgi-rpc", "pyarrow"]
        }}))
    else:
        BenchmarkWorker().run()
