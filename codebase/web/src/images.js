// Bộ nhớ đệm ảnh. Ảnh tải hỏng bị bỏ đi để lần thử lại tải mới, và lỗi được báo lên nơi gọi.
export function imageStore(url) {
  const images = new Map();
  function get(name) {
    if (!images.has(name)) {
      const picture = new Image();
      picture.src = url(name);
      images.set(name, picture);
    }
    return images.get(name);
  }
  function load(name) {
    const picture = get(name);
    return picture.decode().catch((error) => {
      if (picture.complete && picture.naturalWidth) return; // decode() có thể từ chối dù ảnh đã tải
      if (images.get(name) === picture) images.delete(name);
      throw error;
    });
  }
  return { get, load: (names) => Promise.all([...names].map(load)) };
}
