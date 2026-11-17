"""Create a WeChat mini-program ZIP whose root is directly importable."""
from pathlib import Path
import hashlib
import json
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "wechat-miniprogram"
OUT = ROOT / "output"
VERSION = "1.4.2"
ARCHIVE = OUT / f"青小寻-微信小程序源码-v{VERSION}.zip"

required = {
    "project.config.json",
    "app.js",
    "app.json",
    "app.wxss",
    "config.js",
    "pages/map/map.js",
    "pages/map/map.json",
    "pages/map/map.wxml",
    "pages/map/map.wxss",
    "pages/study/study.js",
    "pages/study/study.json",
    "pages/study/study.wxml",
    "pages/study/study.wxss",
    "pages/study/portal.js",
    "pages/study/portal.json",
    "pages/study/portal.wxml",
    "pages/study/portal.wxss",
    "data/campus.js",
    "data/sources.js",
    "utils/map-renderer.js",
    "utils/routing.js",
    "utils/timetable.js",
    "utils/study-map.js",
    "utils/cloud-api.js",
    "utils/privacy.js",
    "utils/privacy-policy.js",
    "components/privacy-dialog/privacy-dialog.js",
    "components/privacy-dialog/privacy-dialog.json",
    "components/privacy-dialog/privacy-dialog.wxml",
    "components/privacy-dialog/privacy-dialog.wxss",
    "pages/privacy/privacy.js",
    "pages/privacy/privacy.json",
    "pages/privacy/privacy.wxml",
    "pages/privacy/privacy.wxss",
    "cloudfunctions/content/index.js",
    "cloudfunctions/content/package.json",
    "cloudfunctions/reviews/index.js",
    "cloudfunctions/reviews/package.json",
}
for relative in required:
    assert (SOURCE / relative).is_file(), relative

config = json.loads((SOURCE / "project.config.json").read_text(encoding="utf-8"))
app_config = json.loads((SOURCE / "app.json").read_text(encoding="utf-8"))
assert config["compileType"] == "miniprogram"
assert config["miniprogramRoot"] == "./"
assert config["projectname"] == "青小寻"
assert config["appid"] == "wx9590889b770efc12"
assert "requiredPrivateInfos" not in app_config
assert "permission" not in app_config
map_source = (SOURCE / "pages/map/map.js").read_text(encoding="utf-8")
assert "wx.getLocation" not in map_source
# "吃在青大" must offer the same three categories as the web and Android clients.
for category in ("cafeteria", "shop", "passage"):
    assert category in map_source, category
assert "地下通道" in (SOURCE / "pages/map/map.wxml").read_text(encoding="utf-8") or "foodTabs" in (
    SOURCE / "pages/map/map.wxml"
).read_text(encoding="utf-8")
# Timetable import must accept .ics calendars and non-UTF-8 CSV exports.
study_source = (SOURCE / "pages/study/study.js").read_text(encoding="utf-8")
for marker in ("schedule-import.js", "text-file.js", "parseImport(", "decodeTextFile(", "'ics'"):
    assert marker in study_source, marker

files = sorted(
    path
    for path in SOURCE.rglob("*")
    if path.is_file()
    and not any(part in {"node_modules", ".git", "__pycache__"} for part in path.parts)
    and path.suffix not in {".pyc", ".log"}
)
main_package_bytes = sum(
    path.stat().st_size
    for path in files
    if "cloudfunctions" not in path.relative_to(SOURCE).parts
)
assert main_package_bytes < 1_500_000, f"main package too large: {main_package_bytes} bytes"
OUT.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(ARCHIVE, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, path.relative_to(SOURCE).as_posix())

with zipfile.ZipFile(ARCHIVE) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert required <= names
    assert "wechat-miniprogram/project.config.json" not in names

digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
(OUT / f"微信小程序源码-v{VERSION}-SHA256.txt").write_text(
    f"{digest}  {ARCHIVE.name}\n", encoding="utf-8"
)
print(
    f"PASS: {len(files)} mini-program files; main package {main_package_bytes / 1024:.1f} KiB; project.config.json at ZIP root; "
    f"CRC and required-entry checks passed. ZIP: {ARCHIVE}"
)
