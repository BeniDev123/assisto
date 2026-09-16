// Downscales a photo client-side before it ever hits the network - a phone
// camera shot can be 10MB+, and nothing here needs more than ~1600px on the
// long edge to be useful on a small screen.
function compressPhotoToBase64(file, maxDim, quality) {
    maxDim = maxDim || 1600;
    quality = quality || 0.82;

    return new Promise(function(resolve, reject) {
        var img = new Image();
        var url = URL.createObjectURL(file);

        img.onload = function() {
            URL.revokeObjectURL(url);

            var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            var w = Math.round(img.width * scale);
            var h = Math.round(img.height * scale);

            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);

            canvas.toBlob(function(blob) {
                if (!blob) { reject(new Error('Bild konnte nicht verarbeitet werden.')); return; }
                var reader = new FileReader();
                reader.onload = function() {
                    var dataUrl = reader.result;
                    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
                    resolve({ contentType: 'image/jpeg', dataBase64: base64 });
                };
                reader.onerror = function() { reject(new Error('Bild konnte nicht gelesen werden.')); };
                reader.readAsDataURL(blob);
            }, 'image/jpeg', quality);
        };

        img.onerror = function() {
            URL.revokeObjectURL(url);
            reject(new Error('Bild konnte nicht geladen werden.'));
        };

        img.src = url;
    });
}
