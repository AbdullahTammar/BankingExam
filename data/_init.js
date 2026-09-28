// Question bank loader. Each entry: [question, options, correctIndex(es), explanation, bookReference]
// Options are written with the correct answer(s) first; the app shuffles them on every attempt.
window.QB = [];
window.addQ = function (chapter, list) {
  list.forEach(function (x, i) {
    QB.push({ id: chapter + '-' + (i + 1), c: chapter, q: x[0], o: x[1], a: [].concat(x[2]), e: x[3], r: x[4] });
  });
};
