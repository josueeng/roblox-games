import base64, io, os
from PIL import Image
OUT = "figma/pranchas"; os.makedirs(OUT, exist_ok=True)
C = dict(bg="#12100E", surface="#1A1714", raised="#24201B", linen="#EEE8DD", muted="#CFC6B8", pequia="#D6A24A", copper="#C4693A", stone="#E6E1D8", ink="#1C1915", line="#3A342D")
FONTS = "@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&amp;family=Manrope:wght@400;500;600&amp;family=DM+Mono:wght@500&amp;display=swap');"
W, H = 1920, 1080

def b64(img, q=82):
    buf = io.BytesIO(); img.convert("RGB").save(buf, "JPEG", quality=q, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def esc(t): return t.replace("&", "&amp;").replace("<", "&lt;")

def text(x, y, t, size, fam="Manrope", fill=C["linen"], weight=400, italic=False, ls=0, anchor="start"):
    f = {"serif": "Fraunces", "sans": "Manrope", "mono": "DM Mono"}.get(fam, fam)
    st = ' font-style="italic"' if italic else ""
    return f'<text x="{x}" y="{y}" font-family="{f}" font-size="{size}" font-weight="{weight}" fill="{fill}" letter-spacing="{ls}" text-anchor="{anchor}"{st}>{esc(t)}</text>'

def lines(x, y, arr, size, lh, **k):
    return "".join(text(x, y + i * lh, t, size, **k) for i, t in enumerate(arr))

def eyebrow(x, y, t, fill=C["pequia"]):
    return f'<rect x="{x}" y="{y-5}" width="36" height="1.5" fill="{fill}"/>' + text(x + 50, y, t.upper(), 15, "mono", fill, 500, ls=3)

LEAF = lambda x, y, s, col=C["pequia"], vein=C["bg"]: (
    f'<g transform="translate({x},{y}) scale({s})"><path fill="{col}" d="M15 1C7 8 3 14 3 20.5 3 27 8.4 32 15 33c6.6-1 12-6 12-12.5C27 14 23 8 15 1Z"/>'
    f'<path fill="none" stroke="{vein}" stroke-width="1.4" stroke-linecap="round" d="M15 6v25.5M15 12.5l-5.6 4.6M15 19l-7 5.6M15 12.5l5.6 4.6M15 19l7 5.6"/></g>')

def svg(name, body, w=W, h=H, bg=C["bg"]):
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
         f'<style>{FONTS}</style><rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>')
    open(f"{OUT}/{name}.svg", "w", encoding="utf-8").write(s)

def image(x, y, w, h, img, clip=None, rx=0):
    # recorta a imagem para caber exatamente (como object-fit: cover)
    iw, ih = img.size; r = max(w / iw, h / ih)
    im = img.resize((max(1, round(iw * r)), max(1, round(ih * r))), Image.LANCZOS)
    L = (im.size[0] - w) // 2; T = (im.size[1] - h) // 2
    im = im.crop((L, T, L + w, T + h))
    cid = f"c{abs(hash((x,y,w,h)))}"
    if rx:
        return (f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/></clipPath>'
                f'<image x="{x}" y="{y}" width="{w}" height="{h}" clip-path="url(#{cid})" href="{b64(im)}"/>')
    return f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="{b64(im)}"/>'

def footer(n, label):
    return (f'<rect x="96" y="{H-80}" width="{W-192}" height="1" fill="{C["line"]}"/>'
            + text(96, H - 44, "FORMATO · PROPOSTA DE SITE", 14, "mono", C["muted"], 500, ls=3)
            + text(W - 96, H - 44, f"{n:02d} — {label.upper()}", 14, "mono", C["muted"], 500, ls=3, anchor="end"))

IMG = lambda n: Image.open(f"v2/img/{n}.jpg") if n != "mesa-pequia" else Image.open("img/mesa-pequia.jpg")
desk = Image.open("figma/desktop-full.jpg")
phones = {n: Image.open(f"figma/m-{n}.jpg") for n in ["1-inicio","2-destaques","3-colecao","4-processo","5-madeiras","6-visite","7-menu","8-foto"]}

# 01 Capa
b = image(1000, 0, 920, H, IMG("mesa-pequia"))
b += f'<rect x="1000" y="0" width="920" height="{H}" fill="url(#fade)"/><defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="{C["bg"]}"/><stop offset=".35" stop-color="{C["bg"]}" stop-opacity="0"/></linearGradient></defs>'
b += LEAF(96, 96, 1.6) + text(160, 128, "FORMATO", 26, "sans", C["linen"], 600, ls=9) + text(160, 152, "MÓVEIS EM MADEIRA", 12, "mono", C["muted"], 500, ls=4)
b += eyebrow(96, 470, "Proposta de site")
b += lines(96, 590, ["Móveis que", "guardam a forma"], 104, 112, fam="serif")
b += text(96, 814, "da árvore.", 104, "serif", C["pequia"], italic=True)
b += text(96, 900, "Site institucional e vitrine de peças · Petrolina, PE", 24, "sans", C["muted"])
b += text(96, H - 60, "OUTUBRO DE 2026", 14, "mono", C["muted"], 500, ls=3)
svg("01-capa", b)

# 02 Conceito
b = eyebrow(96, 170, "O que o site precisa fazer")
b += lines(96, 280, ["Uma vitrine da", "fábrica, aberta"], 84, 92, fam="serif") + text(96, 464, "24 horas.", 84, "serif", C["pequia"], italic=True)
pts = [("01", "Mostrar as peças reais", ["Fotos das mesas, sofás, aparadores e lavabos", "que já saíram da fábrica, organizadas por tipo."]),
       ("02", "Levar o cliente ao WhatsApp", ["Cada peça tem um botão que abre a conversa", "já com o nome da peça na mensagem."]),
       ("03", "Funcionar bem no celular", ["Quem chega pelos stories e pelo WhatsApp", "está no celular, por isso ele vem primeiro."])]
for i, (n, t, d) in enumerate(pts):
    y = 600 + i * 130
    b += f'<rect x="96" y="{y-46}" width="760" height="1" fill="{C["line"]}"/>'
    b += text(96, y, n, 36, "serif", C["pequia"], italic=True) + text(180, y - 6, t, 30, "serif")
    b += lines(180, y + 30, d, 18, 26, fam="sans", fill=C["muted"])
b += image(1000, 96, 380, 820, IMG("poltronas"), rx=6) + image(1420, 96, 404, 400, IMG("lavabo"), rx=6) + image(1420, 516, 404, 400, IMG("mesinha-lateral"), rx=6)
b += footer(2, "Conceito")
svg("02-conceito", b)

# 03 Identidade
b = eyebrow(96, 150, "Identidade visual")
b += text(96, 250, "Cores tiradas do próprio showroom", 64, "serif")
sw = [("Carvão", C["bg"], "Fundo principal"), ("Superfície", C["surface"], "Faixas e cartões"), ("Linho", C["linen"], "Textos"),
      ("Pequiá", C["pequia"], "Destaques e botões"), ("Cobre", C["copper"], "Detalhes"), ("Pedra", C["stone"], "Seção da coleção")]
for i, (n, c, u) in enumerate(sw):
    x = 96 + i * 292
    b += f'<rect x="{x}" y="310" width="268" height="200" rx="6" fill="{c}" stroke="{C["line"]}"/>'
    b += text(x, 550, n, 26, "serif") + text(x, 580, c, 15, "mono", C["muted"], 500, ls=2) + text(x, 606, u, 16, "sans", C["muted"])
b += f'<rect x="96" y="672" width="{W-192}" height="1" fill="{C["line"]}"/>'
b += text(96, 720, "TÍTULOS", 14, "mono", C["pequia"], 500, ls=3) + text(96, 820, "Fraunces", 76, "serif") + text(96, 880, "Elegante, com itálico dourado nos destaques.", 18, "sans", C["muted"])
b += text(760, 720, "TEXTOS", 14, "mono", C["pequia"], 500, ls=3) + text(760, 810, "Manrope", 64, "sans", C["linen"], 500) + text(760, 880, "Leitura fácil no celular.", 18, "sans", C["muted"])
b += text(1300, 720, "ETIQUETAS", 14, "mono", C["pequia"], 500, ls=3) + text(1300, 800, "DM MONO", 48, "mono", C["linen"], 500, ls=6) + text(1300, 880, "Categorias, medidas e materiais.", 18, "sans", C["muted"])
b += footer(3, "Identidade")
svg("03-identidade", b)

# 04–09 Seções no computador
SECS = [(0, "Abertura", ["O logo aparece letra por letra e a tela", "se recolhe para cima. O título surge", "linha por linha e a foto se revela", "com um zoom lento."]),
        (1650, "Destaques", ["Carrossel das peças principais.", "Arrasta com o dedo ou com as setas,", "com barra de progresso embaixo."]),
        (2783, "Coleção", ["Galeria com filtros por tipo de peça.", "As fotos se revelam ao rolar e abrem", "ampliadas, com botão de orçamento."]),
        (7480, "Como fazemos", ["Três etapas: conversa, produção e", "entrega. A foto fica fixa e muda", "conforme a pessoa rola a página."]),
        (9800, "Madeiras", ["Pequiá, jaqueira e madeira com aço.", "Os painéis se abrem quando o mouse", "passa por cima."]),
        (10930, "Visite a loja", ["Endereço, horário, telefone com botão", "de copiar e acesso direto ao mapa", "e ao WhatsApp."])]
for i, (y, name, desc) in enumerate(SECS):
    n = 4 + i
    crop = desk.crop((0, y, 1440, y + 900))
    bx, by, bw = 600, 150, 1224; bh = round(bw * 900 / 1440)
    b = f'<rect x="{bx}" y="{by-44}" width="{bw}" height="{bh+44}" rx="10" fill="{C["raised"]}"/>'
    b += "".join(f'<circle cx="{bx+24+k*20}" cy="{by-22}" r="6" fill="{C["line"]}"/>' for k in range(3))
    b += image(bx, by, bw, bh, crop)
    b += eyebrow(96, 200, f"Computador · {i+1}/6") + text(96, 300, name, 72, "serif")
    b += lines(96, 380, desc, 22, 34, fam="sans", fill=C["muted"])
    b += footer(n, name)
    svg(f"{n:02d}-computador-{i+1}", b)

# 10–11 Celular
groups = [(["1-inicio","2-destaques","3-colecao","4-processo"], ["Abertura","Destaques","Coleção","Como fazemos"]),
          (["5-madeiras","6-visite","7-menu","8-foto"], ["Madeiras","Visite a loja","Menu","Foto ampliada"])]
for g, (keys, labels) in enumerate(groups):
    n = 10 + g
    b = eyebrow(96, 130, f"Celular · {g+1}/2") + text(96, 210, "Pensado primeiro para o celular" if g == 0 else "Menu, foto ampliada e contato", 56, "serif")
    pw, ph = 296, 641
    for k, (key, lab) in enumerate(zip(keys, labels)):
        x = 96 + k * 440 + 57; y = 262
        b += f'<rect x="{x-12}" y="{y-12}" width="{pw+24}" height="{ph+24}" rx="52" fill="#000" stroke="{C["line"]}" stroke-width="2"/>'
        b += image(x, y, pw, ph, phones[key], rx=42)
        b += text(x + pw / 2, y + ph + 62, lab, 22, "serif", anchor="middle")
    b += footer(n, "Celular")
    svg(f"{n:02d}-celular-{g+1}", b)

# 12 Próximos passos
b = eyebrow(96, 170, "Próximos passos") + text(96, 290, "Para colocar no ar", 84, "serif")
steps = [("01", "Aprovar o design", "Cores, fontes, textos e a ordem das seções."),
         ("02", "Conferir as informações", "Horário de todos os dias e o número certo do WhatsApp."),
         ("03", "Escolher as fotos", "Trocar ou acrescentar peças e mandar fotos em boa resolução."),
         ("04", "Publicar", "Registrar o endereço do site e colocar no ar.")]
for i, (nn, t, d) in enumerate(steps):
    y = 430 + i * 130
    b += f'<rect x="96" y="{y-56}" width="1100" height="1" fill="{C["line"]}"/>'
    b += text(96, y, nn, 40, "serif", C["pequia"], italic=True) + text(190, y - 8, t, 34, "serif") + text(190, y + 28, d, 19, "sans", C["muted"])
b += image(1300, 96, 524, 820, IMG("aparador"), rx=6)
b += footer(12, "Próximos passos")
svg("12-proximos-passos", b)

# Página inteira (só para o Figma)
fw = 1440; fh = desk.size[1]
svg("13-pagina-inteira-computador", f'<image x="0" y="0" width="{fw}" height="{fh}" href="{b64(desk, 80)}"/>', fw, fh)
print(sorted(os.listdir(OUT)))
