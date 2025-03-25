# ML Take-Home Assignment: Predicting Insurance Enrollment

## 📘 Problem Statement
You’re joining the data team at a company modernizing insurance using machine learning. As part of an internal pilot, the business wants to predict whether an employee will opt in to a new voluntary insurance product based on demographic and employment-related data.

Your task is to build a machine learning pipeline that processes raw census-style employee data and predicts the likelihood of enrollment.

Things that you will be evaluated on:

1.  Data Processing
2.  Model Development 
3.	Functional code
4.	Code quality
5.	Code comments, readme docs

## 📁 Dataset
We’ll provide a synthetic employee_data.csv file with ~10,000 rows and columns. The dataset consists of synthetic census-style employee data in CSV format.

**File:** `employee_data.csv`  
**Rows:** ~10,000  
**Columns Include:**
- `employee_id`
- `age`
- `gender`
- `marital_status`
- `salary`
- `employment_type`
- `region`
- `has_dependents`
- `tenure_years`
- `enrolled` (target: 1 for enrolled, 0 for not enrolled)

You may assume the data simulates what’s typically collected during group benefits enrollment.

## 📩 Deliverables
Please share your Github repo link that contains:

- A `report.md` or `report.pdf` summarizing:
  - Data observations
  - Model choices & rationale
  - Evaluation results
  - Key takeaways and what you’d do next with more time
- `requirements.txt` or `environment.yml`
- Clear instructions in the README on how to run your code

## 🧠 Bonus (Optional)
If you have time and interest, you may include:
- Hyperparameter tuning
- Experiment tracking (e.g., MLflow, Weights & Biases)
- A REST API (e.g., using FastAPI or Flask) to serve predictions
---

This assignment is designed to be completed in **6–10 hours**. Please don’t worry about perfecting it — we’re most interested in your problem-solving process, ML fundamentals, and code quality.

## 🙌 Good Luck!

We're excited to see your work! If you have any questions during the process, feel free to reach out.

All the best!
