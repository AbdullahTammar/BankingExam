// Credit Advisor (المستشار الائتماني) track. Kept in its own namespace so the retail-banking data stays untouched.
// Question entry: [question, options, correctIndex(es), explanation (why), bookReference, simpleScenario]
// Options are written with the correct answer(s) first; the app shuffles them on every attempt.
window.CR = { QB: [], OLD: [], SCEN: [] };
CR.addQ = function (chapter, list) {
  // Ids continue per chapter, so a chapter can be added in several parts.
  var n = CR.QB.filter(function (q) { return q.c === chapter; }).length;
  list.forEach(function (x, i) {
    CR.QB.push({ id: 'c' + chapter + '-' + (n + i + 1), c: chapter, q: x[0], o: x[1], a: [].concat(x[2]), e: x[3], r: x[4], s: x[5] || '' });
  });
};
