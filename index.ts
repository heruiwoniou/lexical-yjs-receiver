import App from "./server";

const PORT = process.env.PORT || 3333;

App.listen(PORT, () => {
  console.log(`[Shadow Editor Manager] is running at ${PORT}`);
});
