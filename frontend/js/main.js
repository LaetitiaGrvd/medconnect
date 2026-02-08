document.addEventListener("DOMContentLoaded", () => {
  console.log("MedConnect frontend loaded");

  const api = window.MC_API;
  if (!api?.hasBase?.()) return;

  api
    .getJson("/api/health")
    .then(({ data }) => console.log("Backend OK:", data))
    .catch((e) => console.error("Backend not reachable:", e));
});
