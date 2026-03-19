"""Convert PDF pages to 1920x1080 PNG images using PyMuPDF."""
import sys, json, os
import fitz  # PyMuPDF

def main():
    pdf_path, out_dir = sys.argv[1], sys.argv[2]
    W, H = int(sys.argv[3]), int(sys.argv[4])
    os.makedirs(out_dir, exist_ok=True)

    doc   = fitz.open(pdf_path)
    names = []

    for i, page in enumerate(doc):
        # Scale to fit W×H keeping aspect ratio
        r    = page.rect
        zoom = min(W / r.width, H / r.height)
        mat  = fitz.Matrix(zoom, zoom)
        pix  = page.get_pixmap(matrix=mat, alpha=False)

        # Centre on white W×H canvas using PIL
        from PIL import Image
        slide = Image.new("RGB", (W, H), (255, 255, 255))
        img   = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        ox    = (W - pix.width)  // 2
        oy    = (H - pix.height) // 2
        slide.paste(img, (ox, oy))

        fname = f"slide{i+1}.png"
        slide.save(os.path.join(out_dir, fname))
        names.append(fname)

    print(json.dumps(names))

main()
