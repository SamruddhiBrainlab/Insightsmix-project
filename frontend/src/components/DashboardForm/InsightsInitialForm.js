import React, { useRef, useState } from "react";
import { 
  Box, 
  Paper, 
  Grid, 
  TextField, 
  Button, 
  Alert, 
  Typography, 
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@mui/material";

const commonButtonStyles = {
  backgroundColor: "#E9ECED",
  color: "#475657",
  '&:hover': { backgroundColor: "#7e7c7b" },
  minWidth: 'fit-content',
  whiteSpace: 'nowrap',
  textTransform: 'none'
};

const StyledButton = ({ children, ...props }) => (
  <Button
    variant="contained"
    sx={{ ...commonButtonStyles, ...props.sx }}
    {...props}
  >
    {children}
  </Button>
);

const InsightsInitialForm = ({ onEDAComplete }) => {
    const user = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    // const [edaReport, setEdaReport] = useState(null);
    const fileInputRef = useRef(null);
    const [formData, setFormData] = useState({
      projectName: "",
      dataSource: "",
      databaseConfig: {
        username: "",
        password: "",
        databaseName: "",
        tableName: ""
      }
    });
    
    const [dataSourceType, setDataSourceType] = useState("csv_file");
    const [dataSourceDialog, setDataSourceDialog] = useState(false);
    const [dbConnectionDialog, setDbConnectionDialog] = useState(false);
    const backendUrl = process.env.REACT_APP_BACKEND_URL;

    const handleFileChange = async (event) => {
      const file = event.target.files[0];
      setError("");
  
      if (!file) return;
  
      const allowedTypes = {
        'csv_file': ['text/csv'],
        'excel_file': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
      };
  
      if (!allowedTypes[dataSourceType].includes(file.type)) {
        setError(`Please upload a valid ${dataSourceType === 'csv_file' ? 'CSV' : 'Excel'} file`);
        return;
      }
  
      if (file.size > 5 * 1024 * 1024) {
        setError("File size must be less than 5MB");
        return;
      }
  
      const formDataToSend = new FormData();
      formDataToSend.append("file", file);
      formDataToSend.append("data_source", dataSourceType);
  
      try {
        const response = await fetch(`${backendUrl}/api/upload`, {
          method: "POST",
          body: formDataToSend
        });
  
        const data = await response.json();
        
        if (response.ok) {
          setFormData(prev => ({ 
            ...prev, 
            dataSource: data.file_name
          }));
          setDataSourceDialog(false);
        } else {
          throw new Error(data.error || "Failed to upload file");
        }
      } catch (err) {
        setError(err.message || "Error uploading file");
      }
    };
  
    const handleDbConfigSubmit = async () => {
      const formDataToSend = new FormData();
      formDataToSend.append("data_source", "database_connection");
      formDataToSend.append("username", formData.databaseConfig.username);
      formDataToSend.append("password", formData.databaseConfig.password);
      formDataToSend.append("database_name", formData.databaseConfig.databaseName);
      formDataToSend.append("table_name", formData.databaseConfig.tableName);
  
      try {
        const response = await fetch(`${backendUrl}/api/upload`, {
          method: "POST",
          body: formDataToSend
        });
  
        const data = await response.json();
        
        if (response.ok) {
          setFormData(prev => ({
            ...prev,
            dataSource: `${formData.databaseConfig.databaseName}.${formData.databaseConfig.tableName}`
          }));
          setDbConnectionDialog(false);
        } else {
          throw new Error(data.error || "Failed to connect to database");
        }
      } catch (err) {
        setError(err.message || "Error connecting to database");
      }
    };
  
    const handleDatabaseInputChange = (field) => (event) => {
      setFormData(prev => ({
        ...prev,
        databaseConfig: {
          ...prev.databaseConfig,
          [field]: event.target.value
        }
      }));
    };
  
    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!formData.dataSource || !formData.projectName) {
        setError("Please fill all required fields");
        return;
      }
  
      setIsLoading(true);
      setError("");
  
      const fullFormData = {
        ...formData,
        userEmail: user.email
      };

      try {
        // First, generate the EDA report
        const generateResponse = await fetch(`${backendUrl}/api/generate-eda-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fullFormData),
        });
        
        const generateData = await generateResponse.json();
        
        if (!generateResponse.ok) {
          throw new Error(generateData.error || "Failed to generate EDA report");
        }
        console.log(generateData, "-------------", onEDAComplete)
        if (generateData) {
          onEDAComplete(generateData);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
  
    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', width: '100%', gap: 3 }}>
          <CircularProgress size={60} />
          <Typography>Generating EDA Report...</Typography>
        </Box>
      );
    }

  return (
    <Box>
        <Paper sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={6}>
                <Box sx={{ mb: 2 }}>
                  <label>
                    Data Source<span style={{ color: 'red' }}>*</span>
                  </label>
                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <TextField
                      value={formData.dataSource}
                      placeholder="No data source selected"
                      size="small"
                      InputProps={{
                        readOnly: true,
                      }}
                      sx={{ flex: 1 }}
                    />
                    <StyledButton onClick={() => setDataSourceDialog(true)}>
                      Import Data
                    </StyledButton>
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Box sx={{ mb: 2 }}>
                  <label>
                    Project Name<span style={{ color: 'red' }}>*</span>
                  </label>
                  <TextField
                    name="projectName"
                    placeholder="Enter project name"
                    value={formData.projectName}
                    onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
                    fullWidth
                    size="small"
                    sx={{ mt: 1 }}
                  />
                </Box>
              </Grid>
            </Grid>

            <Button
              type="submit"
              variant="contained"
              sx={{
                mt: 3,
                backgroundColor: "#ffdd33",
                color: "#000",
                border: '1px solid #000000',
                borderRadius: '22px',
                textTransform: 'none'
              }}
            >
              Generate Report
            </Button>
          </form>
        </Paper>

      {/* Data Source Selection Dialog */}
      <Dialog open={dataSourceDialog} onClose={() => setDataSourceDialog(false)}>
        <DialogTitle>Select Data Source</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept={dataSourceType === 'csv_file' ? '.csv' : '.xlsx,.xls'}
              style={{ display: 'none' }}
            />
            <StyledButton onClick={() => fileInputRef.current.click()}>
              Upload File
            </StyledButton>
            <StyledButton
              onClick={() => {
                setDataSourceDialog(false);
                setDbConnectionDialog(true);
              }}
            >
              Connect to Database
            </StyledButton>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Database Connection Dialog */}
      <Dialog open={dbConnectionDialog} onClose={() => setDbConnectionDialog(false)}>
        <DialogTitle>Database Connection</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
            <TextField
              label="Username"
              value={formData.databaseConfig.username}
              onChange={handleDatabaseInputChange('username')}
              fullWidth
              size="small"
            />
            <TextField
              label="Password"
              type="password"
              value={formData.databaseConfig.password}
              onChange={handleDatabaseInputChange('password')}
              fullWidth
              size="small"
            />
            <TextField
              label="Database Name"
              value={formData.databaseConfig.databaseName}
              onChange={handleDatabaseInputChange('databaseName')}
              fullWidth
              size="small"
            />
            <TextField
              label="Table Name"
              value={formData.databaseConfig.tableName}
              onChange={handleDatabaseInputChange('tableName')}
              fullWidth
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions>
        <Button
              type="submit"
              variant="contained"
              sx={{
                mt: 3,
                backgroundColor: "#ffdd33",
                color: "#000",
                border: '1px solid #000000',
                borderRadius: '22px',
                textTransform: 'none'
              }}
           onClick={() => setDbConnectionDialog(false)}>
            Cancel
          </Button>
          <Button
              type="submit"
              variant="contained"
              sx={{
                mt: 3,
                backgroundColor: "#ffdd33",
                color: "#000",
                border: '1px solid #000000',
                borderRadius: '22px',
                textTransform: 'none'
              }}
            onClick={handleDbConfigSubmit}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default InsightsInitialForm;