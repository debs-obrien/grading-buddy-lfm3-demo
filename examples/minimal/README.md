# Try LFM3 in two minutes

One HTML file that loads [LFM3-1.7B](https://huggingface.co/onnx-community/LFM3-1.7B-ONNX) in the browser with Transformers.js and WebGPU. No build, no npm. Pure model out of the box; the full app adds topic notes and answer checks on top.

```bash
cd examples/minimal
python3 -m http.server 8000
```

Open http://localhost:8000 in desktop Chrome or Edge, then click **Ask**. The first run downloads about 1 GB; after that the browser cache reuses it. Serve over `http` (do not open the file directly). Needs WebGPU.
