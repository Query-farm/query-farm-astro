"""Offline regression checks for release-specific compatibility snapshots."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

spec = importlib.util.spec_from_file_location(
    "binary_sizes_snapshot", Path(__file__).parents[1] / "binary-sizes-snapshot.py"
)
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


def release(distribution, version, platforms):
    return {"distribution": distribution, "version": version,
            "repository": snapshot.REPOSITORIES[distribution],
            "platforms": platforms, "binarySizes": []}


class CompatibilitySnapshotTests(unittest.TestCase):
    def test_native_release_does_not_change_browser_platforms(self):
        native = [{"platform": "Windows", "architectures": ["ARM64"]}]
        browser = [{"platform": "WASM", "architectures": ["eh"]}]
        releases = [release("duckdb", "2.0.0", native),
                    release("haybarn", "2.0.0", []),
                    release("haybarn", "1.5.6", browser)]
        result = snapshot.assemble_snapshot(releases, "1.5.6", "2026-10-22")
        self.assertEqual(result["platforms"], browser)
        self.assertEqual(result["duckdbVersions"], ["2.0.0", "1.5.6"])
        self.assertEqual(result["compatibilityReleases"][1]["platforms"], [])

    def test_unpublished_releases_are_not_claimed_as_supported(self):
        result = snapshot.assemble_snapshot([
            release("duckdb", "2.0.0", []),
            release("haybarn", "1.5.6", [{"platform": "Linux", "architectures": ["x86_64"]}]),
        ], "1.5.6", "2026-10-22")
        self.assertEqual(result["duckdbVersions"], ["1.5.6"])

    def test_confirmed_404_means_unpublished(self):
        with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(404))) as client:
            self.assertEqual(snapshot.probe_size(client, "https://example.test/ext.gz"), (None, False))

    def test_server_errors_are_not_missing_binaries(self):
        requests = []
        def respond(request):
            requests.append(request)
            return httpx.Response(503)
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            with self.assertRaises(httpx.HTTPStatusError):
                snapshot.probe_size(client, "https://example.test/ext.gz")
        self.assertEqual(len(requests), 3)

    def test_html_error_pages_are_not_artifacts(self):
        with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(
            200, headers={"Content-Type": "text/html", "Content-Length": "2048"}
        ))) as client:
            with self.assertRaises(ValueError):
                snapshot.probe_size(client, "https://example.test/ext.gz")

    def test_range_uses_total_size_and_allows_typed_compressed_wasm(self):
        def respond(request):
            if request.method == "HEAD":
                return httpx.Response(200, headers={"Content-Type": "application/wasm"})
            return httpx.Response(206, headers={"Content-Range": "bytes 0-3/4096"}, stream=httpx.ByteStream(b"\x5f\x39\xdb\xbd"))
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            self.assertEqual(snapshot.probe_size(client, "https://example.test/ext.wasm"), (4096, True))

    def test_get_error_page_is_rejected_when_head_is_unavailable(self):
        def respond(request):
            if request.method == "HEAD":
                return httpx.Response(405, headers={"Content-Type": "text/html", "Content-Length": "2048"})
            return httpx.Response(200, headers={"Content-Type": "text/html"}, stream=httpx.ByteStream(b"<html>error</html>"))
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            with self.assertRaises(ValueError):
                snapshot.probe_size(client, "https://example.test/ext.gz")

    def test_get_uses_artifact_size_instead_of_head_error_size(self):
        def respond(request):
            if request.method == "HEAD":
                return httpx.Response(405, headers={"Content-Type": "text/html", "Content-Length": "2048"})
            return httpx.Response(200, headers={"Content-Type": "application/gzip", "Content-Length": "4096"}, stream=httpx.ByteStream(b"\x1f\x8b\x08\x00"))
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            self.assertEqual(snapshot.probe_size(client, "https://example.test/ext.gz"), (4096, True))

    def test_discovery_keeps_pinned_browser_release(self):
        def respond(request):
            self.assertEqual(str(request.url), "https://api.github.com/repos/duckdb/duckdb/releases/latest")
            return httpx.Response(200, json={"tag_name": "v2.0.0"})
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            (site / "package.json").write_text(json.dumps({"dependencies": {"@haybarn/haybarn-wasm": "1.5.6-rc6"}}))
            with httpx.Client(transport=httpx.MockTransport(respond)) as client:
                self.assertEqual(snapshot.release_plan(client, site, None),
                                 [("duckdb", "2.0.0"), ("haybarn", "1.5.6")])

    def test_duckdb_builds_use_query_farm_repository_and_install_name(self):
        urls = []
        def respond(request):
            urls.append(str(request.url))
            return httpx.Response(200, headers={"Content-Type": "application/octet-stream", "Content-Length": "4096"})
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            result = snapshot.snapshot_release(client, "duckdb", "2.0.0", "openprompt")
        self.assertEqual(result["repository"], "https://duckdb-extensions.query.farm")
        self.assertTrue(urls)
        self.assertTrue(all(url.startswith("https://duckdb-extensions.query.farm/v2.0.0/") and "/open_prompt.duckdb_extension." in url for url in urls))

    def test_browser_builds_use_haybarn_builtin_community_repository(self):
        urls = []
        def respond(request):
            urls.append(str(request.url))
            return httpx.Response(404)
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            snapshot.snapshot_release(client, "haybarn", "1.5.6", "rapidfuzz")
        self.assertTrue(urls)
        self.assertTrue(all(url.startswith("https://haybarn-extensions.query.farm/community/v1.5.6/") for url in urls))

    def test_failed_refresh_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            (site / "package.json").write_text(json.dumps({"dependencies": {"@haybarn/haybarn-wasm": "1.5.6-rc6"}}))
            extension = site / "src/data/extensions/demo"
            (extension / "augment").mkdir(parents=True)
            (extension / "augment/metadata.json").write_text('{}')
            (extension / "generated").mkdir()
            target = extension / "generated/compatibility.json"
            target.write_text('{"existing": true}\n')
            with patch.object(sys, "argv", ["snapshot", "--site", str(site), "--duckdb-version", "2.0.0"]), \
                 patch.object(snapshot, "snapshot_release", side_effect=ValueError("network failure")):
                with self.assertRaises(SystemExit) as stopped:
                    snapshot.main()
            self.assertEqual(stopped.exception.code, 1)
            self.assertEqual(target.read_text(), '{"existing": true}\n')


if __name__ == "__main__":
    unittest.main()
