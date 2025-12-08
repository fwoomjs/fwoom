# Fwoom JS

```js
import { Fwoom } from "fwoom";

const app = new Fwoom();

app.get("/hello", () => ({ message: "Hello Fwoom" }));

app.listen(3000);

```