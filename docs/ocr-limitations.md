# OCR Limitations

Local OCR is enabled by default for the local MVP and remains configurable:

```bash
ENABLE_LOCAL_OCR=true
OCR_LANGUAGE=eng
OCR_MAX_FILE_SIZE_MB=50
```

## What Works

- PNG OCR through local `tesseract.js`
- JPG/JPEG OCR through local `tesseract.js`
- Scanned PDF OCR when a local PDF renderer such as `pdftoppm` is installed
- OCR runs during indexing only; chat searches the saved local SQLite chunks

## What Falls Back To Metadata

- OCR explicitly disabled with `ENABLE_LOCAL_OCR=false`
- OCR file size exceeds `OCR_MAX_FILE_SIZE_MB`
- OCR fails or returns no readable text
- Scanned PDFs when no local PDF renderer is available

## Office Image Limitation

PPTX and DOCX embedded images are detected but not OCR-indexed yet. The file stays indexed from normal text when possible, and the UI shows:

```text
Embedded images were not OCR-indexed yet.
```

## Future Work

- OCR for embedded Office images
- Better scanned PDF page rendering controls
- Speech-to-text for videos
- Vector embeddings and semantic search
- Thumbnail previews

No OCR or document content is sent to cloud APIs by this MVP.
