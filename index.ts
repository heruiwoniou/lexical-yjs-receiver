import App from "./server";

const PORT = process.env.PORT || 3000;

App.listen(PORT, () => {
  console.log(`[Shaddow Editor Manager] is running at ${PORT}`);
});
