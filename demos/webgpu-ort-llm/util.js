async function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.onload = resolve;
    script.onerror = reject;
    script.src = url;
    if (url.startsWith('http')) {
      // script.crossOrigin = 'anonymous';
    }
    document.body.append(script);
  })
}

async function loadOrt() {
  const ortUrl = getParam('ortUrl');
  let urls;
  if (ortUrl) {
    urls = [ortUrl];
  } else {
    urls = ['https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.webgpu.min.js'];
  }
  for (let url of urls) {
    await loadScript(url);
  }
}

// Get model via Origin Private File System
async function getModelOPFS(name, url, updateModel = false) {
  const root = await navigator.storage.getDirectory();
  let fileHandle;

  async function updateFile() {
    const response = await fetch(url);
    const buffer = await readResponse(response);
    fileHandle = await root.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return buffer;
  }

  if (updateModel) {
    return await updateFile();
  }

  try {
    fileHandle = await root.getFileHandle(name);
    const blob = await fileHandle.getFile();
    return await blob.arrayBuffer();
  } catch (e) {
    return await updateFile();
  }
}

async function fetchAndCache(url, logFunction = console.log) {
  logFunction(`Loading: ${url}`);
  try {
    const cache = await caches.open("onnx");
    let cachedResponse = await cache.match(url);
    if (cachedResponse == undefined) {
      await cache.add(url);
      cachedResponse = await cache.match(url);
      logFunction(`Loaded from network: ${url}`);
    } else {
      logFunction(`Loaded from cache: ${url}`);
    }
    const data = await cachedResponse.arrayBuffer();
    return data;
  } catch (error) {
    const response = await fetch(url);
    logFunction(`Loaded from network: ${url}`);
    return response.arrayBuffer();
  }
}

function getParam(name) {
  name = name.replace(/[\[\]]/g, '\\$&');
  let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)', 'i');
  let results = regex.exec(window.location.href);
  if (!results)
    return null;
  if (!results[2])
    return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function getSum(data) {
  return data.reduce((accumulator, currentValue) => { return accumulator + currentValue }, 0);
}

function getTensor(type, data, dims) {
  let typedArray;
  if (type === 'bool') {
    return new ort.Tensor(type, [data], [1]);
  } else if (type === 'uint16') {
    typedArray = Uint16Array;
  } else if (type === 'float16') {
    typedArray = Uint16Array;
  } else if (type === 'float32') {
    typedArray = Float32Array;
  } else if (type === 'int32') {
    typedArray = Int32Array;
  } else if (type === 'int64') {
    typedArray = BigInt64Array;
  }

  let _data;
  if (Array.isArray(data)) {
    _data = data;
  } else {
    let size = 1;
    dims.forEach((dim) => {
      size *= dim;
    });
    if (data === 'random') {
      _data = typedArray.from({ length: size }, () => Math.random());
    } else if (data === 'ramp') {
      _data = typedArray.from({ length: size }, (_, i) => i);
    } else {
      _data = typedArray.from({ length: size }, () => data);
    }
  }
  return new ort.Tensor(type, _data, dims);
}

function getModelBaseUrl(config, model) {
  let modelUrl = config.modelUrl || 'wp-27';
  
  if (modelUrl === 'hf') {
    if (typeof model.hfTreeFullName === 'undefined') {
      const err = `modelUrl=hf is not supported for ${model.name} yet.`;
      // log(err);
      throw new Error(err);
    }
    return `https://huggingface.co/${model.hfTreeFullName}/resolve/main`;
  } else if (modelUrl === 'wp-27') {
    if (typeof model.wp27TreeFullName === 'undefined') {
      const err = `modelUrl=wp-27 is not supported for ${model.name} yet.`;
      // log(err);
      throw new Error(err);
    }
    return `https://wp-27.sh.intel.com/workspace/project/models/${model.wp27TreeFullName}`;
  } else {
    // If modelUrl is neither 'wp-27' nor 'hf', just return it
    return modelUrl;
  }
}

/*
async function init() {
  await loadOrt();

  let modelUrl = getParam('modelUrl') || 'hf';
  if (modelUrl === 'hf') {
    modelUrl = `https://huggingface.co/onnxruntime/models/resolve/main/`;
  } else if (modelUrl === 'server') {
    modelUrl = `${window.location.origin}/${window.location.pathname}ort-models/`;
  } else if (modelUrl === 'wp-27') {
    modelUrl = `https://wp-27.sh.intel.com/workspace/project/ort-models/`;
  }
}
*/

async function readResponse(response) {
  const contentLength = response.headers.get('Content-Length');
  let total = parseInt(contentLength ?? '0');
  let buffer = new Uint8Array(total);
  let loaded = 0;

  const reader = response.body.getReader();
  async function read() {
    const { done, value } = await reader.read();
    if (done) return;

    let newLoaded = loaded + value.length;
    if (newLoaded > total) {
      total = newLoaded;
      let newBuffer = new Uint8Array(total);
      newBuffer.set(buffer);
      buffer = newBuffer;
    }
    buffer.set(value, loaded);
    loaded = newLoaded;
    return read();
  }

  await read();
  return buffer;
}

function reportStatus(status) {
  document.getElementById('status').innerHTML = status;
}
