"""Gera FujaDoTsunami.rbxlx a partir de src/, sem precisar do Rojo.

Uso (na pasta fuja-do-tsunami):  python3 tools/build_rbxlx.py
"""

from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "FujaDoTsunami.rbxlx"

_ref = 0


def ref():
    global _ref
    _ref += 1
    return f"RBX{_ref:08d}"


def cdata(text):
    return "<![CDATA[" + text.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def item(cls, name, children="", source=None):
    props = f'<string name="Name">{escape(name)}</string>'
    if source is not None:
        props += f'<ProtectedString name="Source">{cdata(source)}</ProtectedString>'
    return f'<Item class="{cls}" referent="{ref()}"><Properties>{props}</Properties>{children}</Item>\n'


def script_item(path):
    name = path.name
    if name.endswith(".server.lua"):
        return item("Script", name[: -len(".server.lua")], source=path.read_text(encoding="utf-8"))
    if name.endswith(".client.lua"):
        return item("LocalScript", name[: -len(".client.lua")], source=path.read_text(encoding="utf-8"))
    return item("ModuleScript", path.stem, source=path.read_text(encoding="utf-8"))


def folder(name, directory):
    children = "".join(script_item(p) for p in sorted(directory.glob("*.lua")))
    return item("Folder", name, children)


def main():
    body = (
        item("ReplicatedStorage", "ReplicatedStorage", folder("Shared", SRC / "shared"))
        + item("ServerScriptService", "ServerScriptService", folder("Server", SRC / "server"))
        + item(
            "StarterPlayer",
            "StarterPlayer",
            item("StarterPlayerScripts", "StarterPlayerScripts", folder("Client", SRC / "client")),
        )
    )
    OUT.write_text(f'<roblox version="4">\n{body}</roblox>\n', encoding="utf-8")
    print(f"Gerado {OUT}")


if __name__ == "__main__":
    main()
