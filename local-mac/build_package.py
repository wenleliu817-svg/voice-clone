"""Build a distributable Mac folder from the current frontend, without credentials."""
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs' / 'downloads' / 'voice-clone-mac.zip'
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
prefix = '声音复刻_Mac本地版/'
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED) as archive:
    for name in ('server.py','启动声音复刻.command','使用说明.txt'):
        info = zipfile.ZipInfo(prefix + name)
        info.create_system = 3
        info.external_attr = (0o100755 if name.endswith('.command') else 0o100644) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, (ROOT / 'local-mac' / name).read_bytes())
    for name in ('index.html','app.js','transport.js','styles.css'):
        data = (ROOT / 'docs' / name).read_text()
        if name == 'index.html':
            data = '\n'.join(line for line in data.split('\n') if 'downloads/voice-clone-mac.zip' not in line)
            data = data.replace('GitHub Pages 体验页', 'Mac 本地体验页').replace('轻量 API 代理', '本机直连有道')
        archive.writestr(prefix + 'web/' + name,data)
print(str(OUTPUT))
