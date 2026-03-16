// helper/soft_credit_checker.js
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

function getCreditTier(score) {
  if (score >= 750) return "Excellent";
  if (score >= 700) return "Good";
  if (score >= 650) return "Fair";
  return "Needs Review";
}

app.post('/soft-credit-check', (req, res) => {
  const creditScore = Math.floor(Math.random() * (780 - 620) + 620);
  res.json({
    credit_score: creditScore,
    credit_tier: getCreditTier(creditScore)
  });
});

app.listen(8000, () => console.log('Credit checker running on port 8000'));