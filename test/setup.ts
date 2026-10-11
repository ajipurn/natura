// happy-dom membuat promise `finished` bahkan tanpa dibaca. Pembatalan WAAPI memang
// menolaknya dengan AbortError; tangani penolakan ini agar tes tidak menganggapnya bug app.
if (typeof Element !== "undefined" && typeof Element.prototype.animate === "function") {
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const animation = animate.apply(this, args);
    void animation.finished.catch((error: Error) => {
      if (error.name !== "AbortError") throw error;
    });
    return animation;
  };
}
