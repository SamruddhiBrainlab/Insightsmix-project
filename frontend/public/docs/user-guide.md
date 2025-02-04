## **What is InsightsMix?**

InsightsMix is an advanced Marketing Mix Modeling (MMM) application designed to help businesses evaluate and optimize their marketing strategies. Currently, the platform uses one model to provide data-driven insights into how different marketing channels contribute to overall performance. The application aims to empower decision-makers with a deeper understanding of their marketing investments for better ROI. Future updates will introduce two additional models for comparison and improved insights.

## **Features of InsightsMix**

### **1\. Data Ingestion**

* **What it does:** Allows users to upload marketing data through a user-friendly interface.  
* **Supported file formats:** CSV, Excel, or direct database credentials (username, password, database name, table name).  
* **How it works:** The user can upload their marketing data (e.g., ad spend, channel performance, sales data) to Google Cloud Storage (GCS), where the data is validated and preprocessed.

### **2\. Exploratory Data Analysis (EDA)**

* **What it does:** Generates an initial EDA report on the uploaded dataset.  
* **How it works:** InsightsMix automatically analyzes the dataset and provides a visual report highlighting key data points and possible issues (e.g., missing values, correlations).

### **3\. Model Training**

* **What it does:** Trains a single model to evaluate the marketing impact on performance.  
* **Current Model:**  
  * **Google's Meridian**: This advanced machine-learning-based approach is used for training to help businesses gain insights into how various marketing channels contribute to performance.  
* **How it works:** Users can select specific columns or features (like 'GEO' in a sample dataset) from the data source. The system then trains the model using Google's Meridian.

### **4\. Model Evaluation**

* **What it does:** Evaluates the performance of the model based on defined metrics.  
* **Metrics:** R-squared, RMSE (Root Mean Squared Error), AIC (Akaike Information Criterion), BIC (Bayesian Information Criterion).  
* **How it works:** After training, the model's performance is evaluated based on the metrics mentioned above. The results are presented in a detailed report.

### **5\. Result Presentation**

* **What it does:** Presents the trained model's performance and actionable insights.  
* **How it works:** The results are visualized in reports that show how each marketing channel contributed to performance. These reports are accessible through the InsightsMix dashboard.

### **6\. MSO Optimization**

* **What it does:** Provides an MSO (Marketing Spend Optimization) report to help businesses optimize future marketing budgets.  
* **How it works:** InsightsMix uses the trained model to recommend an optimized allocation of marketing spend across different channels for maximum ROI.

### **7\. Gen AI Explanation**

* **What it does:** Provides AI-generated explanations of the reports.  
* **How it works:** This feature uses natural language processing to generate easy-to-understand summaries and insights from the modeling results, making it easier for non-technical users to interpret the findings.

---

## **Sample Data Set and User Inputs**

### **Sample Data Set:**

### 

| geo   | Date       | Channel0_impression | Discount | GQV        | Channel0_spend | Channel1_spend | conversions  |
|-------|------------|---------------------|----------|------------|----------------|----------------|--------------|
| Geo0  | 2021-01-25 | 79241.0             | 0.115581 | -0.259983  | 564.3731       | 1902.1157      | 1957658.5    |
| Geo0  | 2021-02-01 | 167418.0            | 0.944224 | -0.489271  | 1192.3905      | 2391.817       | 2058891.1    |
| Geo0  | 2021-02-08 | 0.0                 | -1.290579| 0.683819   | 0.0            | 1448.6895      | 1903555.1    |
| Geo0  | 2021-02-15 | 0.0                 | -1.084513| 1.2890546  | 0.0            | 1033.8406      | 2503275.5    |
| Geo0  | 2021-02-22 | 0.0                 | -0.017502| 0.22773853 | 0.0            | 2926.6072      | 3489248.0    |
| Geo0  | 2021-03-01 | 0.0                 | -0.302114| -0.126238  | 0.0            | 1533.5364      | 2239088.8    |

### 

### **User Inputs:**
* **Data Upload:** User uploads a CSV file containing marketing data (e.g., sales, ad spend).  
* **Dropdown Inputs:** Based on the dataset, the dropdown menus dynamically show options such as 'Channel,' 'Ad Spend,' and 'GEO.'  
   * Example: 'GEO' will be shown in the dropdown for geographical region selection.  
* **Model Training Inputs:**  
   * **Target Variable:** Sales  
   * **Feature Variables:** Ad Spend, Channel, GEO  
* **Expected Outcome:**  
   * After model training, InsightsMix will generate:  
     * **MMM Model Summary Report:** A detailed report showing the performance and insights of the model.  
     * **MSO Optimization Report:** Recommendations on how to optimize future marketing spend.  
     * **Gen AI Explanation:** A natural language summary explaining the insights from the reports.

---

## **How a New User Can Be Onboarded**

### **1\. User Registration:**

* Sign up or log in using a **Google Account**.  
* **Step 1:** Click on the "Login with Google" button on the home page.

### **2\. Data Upload:**

* **Step 2:** Once logged in, the user is directed to the data upload page.  
  * Upload a file in CSV or Excel format, or provide database credentials (username, password, database name, and table name) to fetch data directly.

### **3\. EDA Report Generation:**

* **Step 3:** Upon uploading, InsightsMix will automatically generate an **EDA report** of the data.  
* **Step 4:** Review the EDA report to ensure the data looks correct. If satisfied, the user can proceed with model training.

### **4\. Model Training:**

* **Step 5:** From the EDA report, select relevant input fields from the dropdowns that appear (based on the dataset columns).  
  * Example: Choose 'GEO' for geography, 'Channel' for marketing channels, and 'Sales' as the target variable.  
* **Step 6:** Click on the "Train Model" button to initiate the training process. The application will begin training using Google's Meridian.

### **5\. Results Review:**

* **Step 7:** Once the model training is complete, the user can access the following:  
  * **MMM Model Summary Report:** A detailed summary of the model's performance.  
  * **MSO Optimization Report:** Insights into how to optimize marketing spend.  
  * **Gen AI Explanation:** An AI-generated summary of the reports.

### **6\. Post-Training Actions:**

* **Step 8:** The results can be downloaded in multiple formats (e.g., visual charts, downloadable documents).  
* **Step 9:** Use the insights to adjust marketing strategies and optimize the marketing budget for better performance.