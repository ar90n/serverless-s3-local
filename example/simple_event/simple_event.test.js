const got = require('got');

it('works with async/await', async () => {
  const {body} = await got('http://localhost:3000/dev', {responseType: 'json'});
  expect(body).toEqual('ok');
});
