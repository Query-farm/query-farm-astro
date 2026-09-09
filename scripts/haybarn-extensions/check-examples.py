"""Verify the downloadable SheetReader example using the published engine."""
from pathlib import Path
import json
import tempfile
import haybarn
from xlsxwriter import Workbook

root = Path(__file__).resolve().parents[2]
destination = root / "public/products/haybarn/extensions/examples/sales.xlsx"
destination.parent.mkdir(parents=True, exist_ok=True)
workbook = Workbook(destination)
sheet = workbook.add_worksheet("Sales")
for index, row in enumerate([("product", "quarter", "revenue"), ("Coffee", "Q1", 240), ("Tea", "Q1", 80), ("Coffee", "Q2", 300), ("Tea", "Q2", 100)]):
    sheet.write_row(index, 0, row)
workbook.close()
with tempfile.TemporaryDirectory() as directory:
    connection = haybarn.connect(config={"extension_directory": directory})
    connection.execute("FORCE INSTALL sheetreader FROM community; LOAD sheetreader;")
    result = connection.execute("SELECT product, sum(revenue) AS revenue FROM sheetreader(?, sheet_name = 'Sales', has_header = true) GROUP BY product ORDER BY revenue DESC", [str(destination)]).fetchall()
    assert result == [("Coffee", 540), ("Tea", 180)], result
    assert connection.execute("SELECT count(*) FROM sheetreader(?, sheet_index = 1, has_header = true)", [str(destination)]).fetchone() == (4,)
    assert connection.execute("SELECT typeof(revenue) FROM sheetreader(?, has_header = true, types = ['VARCHAR', 'VARCHAR', 'VARCHAR'], force_types = true, coerce_to_string = true) LIMIT 1", [str(destination)]).fetchone() == ("VARCHAR",)
    print(json.dumps({"engine": connection.execute("SELECT version()").fetchone()[0], "example": result, "checks": 3}))
    connection.close()
