/**
 * Helpers for the picture library: shop type -> picture category, and getting an uploaded file ready
 * (resized and converted to JPEG in the browser so uploads stay small and always work with WhatsApp).
 */

export const IMAGE_CATEGORIES = [
  'Restaurant', 'Cafe', 'Bakery', 'Grocery', 'Clothing & Fashion', 'Pharmacy',
  'Salon & Beauty', 'Gym', 'Electronics', 'Hardware & Auto', 'General',
];

// Checked in order: the first rule that matches the shop's type wins.
const RULES = [
  ['Cafe', /caf[eé]|coffee|tea\b|chai|juice|shake|ice ?cream|dessert/i],
  ['Bakery', /bakery|bake|sweet|confection|cake/i],
  ['Restaurant', /restaurant|food|dhaba|biryani|dosa|hotel|meal|kitchen|dining|fast food|takeaway|takeout|eatery|tiffin|bar\b|pub\b/i],
  ['Pharmacy', /pharmac|medical|chemist|drug|clinic|hospital/i],
  ['Salon & Beauty', /salon|beauty|spa\b|hair|barber|parlou?r|makeup/i],
  ['Gym', /gym|fitness|yoga|sport/i],
  ['Clothing & Fashion', /cloth|textile|tailor|boutique|fashion|apparel|saree|shoe|footwear|jewel|garment|wear\b/i],
  ['Electronics', /electronic|mobile|phone|computer|laptop|appliance|camera/i],
  ['Hardware & Auto', /hardware|furniture|auto|car\b|bike|tyre|tire|garage|paint|plywood|building|home improvement/i],
  ['Grocery', /grocer|supermarket|general store|department|convenience|mart\b|kirana|provision|meat|poultry|fish|vegetable|fruit|store\b/i],
];

/** Which picture category fits a shop type such as "Restaurant", "Coffee Shop" or "Pharmacy". */
export function imageCategoryFor(shopCategory) {
  const text = String(shopCategory || '');
  for (const [category, pattern] of RULES) {
    if (pattern.test(text)) return category;
  }
  return 'General';
}

/** The most common picture category among several shops (used when one message goes to many). */
export function dominantImageCategory(shops) {
  const counts = {};
  (shops || []).forEach((s) => {
    const c = imageCategoryFor(s?.category);
    counts[c] = (counts[c] || 0) + 1;
  });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'General';
}

const MAX_FILE_BYTES = 12 * 1024 * 1024; // what we are willing to read from the device
const FULL_SIDE = 1280;
const THUMB_SIDE = 480;
const FULL_LIMIT = 1_100_000; // a little under the server's 1.2 MB limit

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}

function render(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

const bytesOf = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

/** A chosen file -> { dataUrl, thumbUrl }, both JPEG, small enough to upload. Throws a friendly Error. */
export async function prepareImageFile(file) {
  if (!file) throw new Error('No picture was chosen.');
  if (!/^image\//.test(file.type)) throw new Error('Please choose a picture (JPG, PNG or WebP).');
  if (file.size > MAX_FILE_BYTES) throw new Error('That picture is very large. Please choose one under 12 MB.');
  const img = await loadImage(file);
  let dataUrl = render(img, FULL_SIDE, 0.88);
  // squeeze further if a detailed picture is still too heavy
  for (const [side, quality] of [[1100, 0.8], [900, 0.75], [720, 0.7]]) {
    if (bytesOf(dataUrl) <= FULL_LIMIT) break;
    dataUrl = render(img, side, quality);
  }
  if (bytesOf(dataUrl) > FULL_LIMIT) throw new Error('That picture is too detailed to upload. Please try a smaller one.');
  return { dataUrl, thumbUrl: render(img, THUMB_SIDE, 0.8), name: file.name.replace(/\.[^.]+$/, '') };
}
