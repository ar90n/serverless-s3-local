it("works with async/await", async () => {
  const body = await fetch("http://localhost:3000/dev").then((res) =>
    res.json(),
  );
  expect(body).toEqual("ok");
});
