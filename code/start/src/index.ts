import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Start Server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});