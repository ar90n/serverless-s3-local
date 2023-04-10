const fetch = require("node-fetch");

it("works with async/await", async () => {
  const response = await fetch("http://localhost:3000/dev");
  const body = await response.json();
  expect(body).toEqual("ok");
});
