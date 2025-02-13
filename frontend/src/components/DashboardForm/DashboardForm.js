import React, { useRef, useState, useEffect } from "react";
import { Box, Paper, Grid, TextField, MenuItem, Button, Alert, Select, Checkbox, ListItemText, CircularProgress, Dialog, DialogContent, DialogContentText, Typography } from "@mui/material";
import { useTheme, useMediaQuery } from "@mui/material";
import axios from "axios";
import "./DashboardForm.css";

const DashboardForm = () => {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const fileInputRef = useRef(null);

  const savedJobId = localStorage.getItem('jobId');
  const savedIsLoading = localStorage.getItem('isLoading') === 'true';
  const user = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
  const [jobId, setJobId] = useState(savedJobId || null);
  const [isLoading, setIsLoading] = useState(savedIsLoading);
  const [isJobCompleted, setIsJobCompleted] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePath, setFilePath] = useState("");
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    dataSource: "",
    projectName: "",
    controls: "",
    population: "",
    media: "",
    time: "",
    geo: "",
    kpi: "",
    revenuePerKpi: "",
    mediaSpend: "",
  });

  const [dropdownOptions, setDropdownOptions] = useState({
    time: [],
    geo: [],
    controls: [],
    population: [],
    kpi: [],
    revenuePerKpi: [],
    media: [],
    mediaSpend: [],
  });

  // Job status polling
  useEffect(() => {
    let intervalId;

    const checkJobStatus = async () => {
      if (!jobId) return;

      try {
        const cropJobId = jobId.split("/").pop();
        const response = await fetch(`/api/training/status/${cropJobId}`);
        const data = await response.json();

        if (data.state === 'JOB_STATE_SUCCEEDED') {
          setIsJobCompleted(true);
          setIsLoading(false);
          clearInterval(intervalId);
          // Reset form after slight delay
          setTimeout(() => {
            resetForm();
          }, 2000);
        } else if (data.state === 'JOB_STATE_FAILED') {
          setError('Job failed: ' + (data.error || 'Unknown error'));
          setIsLoading(false);
          clearInterval(intervalId);
          // Reset form after slight delay
          setTimeout(() => {
            resetForm();
          }, 2000);
        }
      } catch (err) {
        console.error('Error checking job status:', err);
      }
    };

    if (jobId && !isJobCompleted) {
      intervalId = setInterval(checkJobStatus, 10000); // Check every 10 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, isJobCompleted]);

  const resetForm = () => {
    setFormData({
      dataSource: "",
      projectName: "",
      controls: "",
      population: "",
      media: "",
      time: "",
      geo: "",
      kpi: "",
      revenuePerKpi: "",
      mediaSpend: "",
    });
    setSelectedFile(null);
    setJobId(null);
    setIsJobCompleted(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    localStorage.removeItem('jobId');
    localStorage.removeItem('isLoading');
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    setError("");
    setSelectedFile(null);

    if (!file) return;
    if (file.type !== "text/csv") {
      setError("Please upload a valid CSV file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadResponse = await axios.post(`/api/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (uploadResponse.data.file_path) {
        setFilePath(uploadResponse.data.file_path);
        setSelectedFile(file);
      }
    } catch (err) {
      setError("Error uploading file");
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      const headers = content.split("\n")[0].split(",");
      categorizeColumns(headers);
      setSelectedFile(file);
    };
    reader.readAsText(file);
  };

  const categorizeColumns = (headers) => {
    const options = {
      time: headers.filter(col => {
        const lowerCol = col.toLowerCase();
        return lowerCol.includes('date') || lowerCol.includes('time');
      }),
      geo: headers.filter(col => col.toLowerCase().includes('geo')),
      controls: headers.filter(col => {
        const lowerCol = col.toLowerCase();
        return !lowerCol.includes('date') && !lowerCol.includes('time') && !lowerCol.includes('geo') && !lowerCol.includes('impression') && !lowerCol.includes('spend');
      }),
      kpi: headers.filter(col => {
        const lowerCol = col.toLowerCase();
        return !lowerCol.includes('date') && !lowerCol.includes('time') && !lowerCol.includes('geo') && !lowerCol.includes('impression') && !lowerCol.includes('spend');
      }),
      population: headers.filter(col => !col.toLowerCase().includes('date') && !col.toLowerCase().includes('time')),
      revenuePerKpi: headers.filter(col => !col.toLowerCase().includes('date') && !col.toLowerCase().includes('time')),
      media: headers.filter(col => col.toLowerCase().includes('spend') || col.toLowerCase().includes('impression')),
      mediaSpend: headers.filter(col => col.toLowerCase().includes('spend')),
    };

    setDropdownOptions(options);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile || !formData.projectName) {
      setError("Please fill all required fields");
      return;
    }

    setIsLoading(true);
    setError("");

    const fullFormData = {
      ...formData,
      dataSource: filePath,
      userEmail: user.email
    };

    try {
      const response = await fetch(`/api/submit-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullFormData),
      });
      const data = await response.json();
      
      if (response.ok) {
        setJobId(data.result.job_id);
        localStorage.setItem('jobId', data.result.job_id);
        localStorage.setItem('isLoading', 'true');
      } else {
        throw new Error(data.message || "Submission failed");
      }
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) {
      localStorage.setItem('isLoading', 'true');
    } else {
      localStorage.removeItem('isLoading');
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', width: '100%', gap: 3 }}>
        <CircularProgress size={60} />
        <Typography variant="h5" textAlign="center">Your Model is Training</Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">Please wait while we process your data...</Typography>
      </Box>
    );
  }

  return (
    <Box className="dashboard-form" sx={{ 
      width: '800px',
      margin: '0 auto'
    }}>
      <Paper className="form-container">
        <form onSubmit={handleSubmit}>
          <Grid container spacing={isSmallScreen ? 2 : 3}>
            <Grid item xs={12} md={6}>
              <Box className="form-group">
                <label>
                  Data Source<span className="required">*</span>
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="file-input"
                  accept=".csv"
                />
              </Box>

              <Box className="form-group">
                <label>
                  Project Name<span className="required">*</span>
                </label>
                <TextField
                  name="projectName"
                  value={formData.projectName}
                  onChange={handleChange}
                  fullWidth
                  placeholder="Enter project name"
                  size="small"
                />
              </Box>

              {["controls", "population", "media"].map((field) => (
                <Box key={field} className="form-group">
                  <label>
                    {field === "controls" ? "Control Variable" : field.charAt(0).toUpperCase() + field.slice(1)}
                    {field !== "population" && <span className="required">*</span>}
                  </label>
                  <Select
                    name={field}
                    multiple
                    value={formData[field] || []}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                    fullWidth
                    size="small"
                    renderValue={(selected) => selected.join(", ")}
                  >
                    {dropdownOptions[field]?.map((option, idx) => (
                      <MenuItem key={idx} value={option}>
                        <Checkbox checked={(formData[field] || []).includes(option)} />
                        <ListItemText primary={option} />
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              ))}

            </Grid>

            <Grid item xs={12} md={6}>
              {["time", "geo", "kpi", "revenuePerKpi", "mediaSpend"].map((field) => (
                <Box key={field} className="form-group">
                  <label>
                    {field === "time" ? "Date" : field.charAt(0).toUpperCase() + field.slice(1)}
                    <span className="required">*</span>
                  </label>
                  <Select
                    name={field}
                    multiple
                    value={formData[field] || []}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                    fullWidth
                    size="small"
                    renderValue={(selected) => selected.join(", ")}
                  >
                    {dropdownOptions[field]?.map((option, idx) => (
                      <MenuItem key={idx} value={option}>
                        <Checkbox checked={(formData[field] || []).includes(option)} />
                        <ListItemText primary={option} />
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              ))}
            </Grid>
          </Grid>

          <Box className="form-actions" sx={{ textAlign: "left" }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              sx={{
                backgroundColor: "#fcd535",
                color: "#000",
                border: "1px solid #000",
                borderRadius: "30px",
                "&:hover": {
                  backgroundColor: "#fccd17",
                  border: "2px solid #000",
                },
                px: 4,
                py: 0.5,
              }}
            >
              Submit
            </Button>
          </Box>
        </form>
      </Paper>

      <Dialog open={isJobCompleted} onClose={() => setIsJobCompleted(false)}>
        <DialogContent>
          <DialogContentText>Job completed successfully! The form will reset in a moment.</DialogContentText>
        </DialogContent>
      </Dialog>

      {error && <Alert severity="error" sx={{ mt: 2, width: "500px"}} onClose={() => setError("")}>{error}</Alert>}
    </Box>
  );
};

export default DashboardForm;