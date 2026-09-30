let answer = 1 + Math.floor(Math.random() * 100), tries = 0;
document.getElementById("go").onclick = () => {
  const v = Number(document.getElementById("n").value), m = document.getElementById("msg");
  if (!v) return;
  tries++;
  if (v === answer) { m.textContent = `正解！ ${tries}回でした`; answer = 1 + Math.floor(Math.random() * 100); tries = 0; }
  else m.textContent = v < answer ? "もっと大きい" : "もっと小さい";
};
