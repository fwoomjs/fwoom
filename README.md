# Fwoom JS

```js
import { Fwoom } from "fwoom";

const app = new Fwoom();

app.get("/hello", () => ({ message: "Hello from FwoomRouter V2" }));

app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));

app.listen(3000).then(() => {
  console.log("Fwoom running on http://localhost:3000");
});


```