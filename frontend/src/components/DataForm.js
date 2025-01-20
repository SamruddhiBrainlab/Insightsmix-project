import React, { useState } from "react";
import { Grid, TextField, Button, MenuItem, Select, InputLabel, FormControl } from "@mui/material";

const DataForm = () => {
  const [formData, setFormData] = useState({
    dataSource: "",
    projectName: "",
    dataGranularity: "",
    targetSelector: "",
    dateSelector: "",
    investmentSelector: "",
    currencySelector: "",
    targetTypeSelector: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "800px", margin: "auto", backgroundColor: "#fff", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            label="Data Source*"
            fullWidth
            value={formData.dataSource}
            onChange={(e) => setFormData({ ...formData, dataSource: e.target.value })}
          />
        </Grid>

        <Grid item xs={12}>
          <FormControl fullWidth>
            <InputLabel>Date Selector*</InputLabel>
            <Select
              value={formData.dateSelector}
              onChange={(e) => setFormData({ ...formData, dateSelector: e.target.value })}
            >
              <MenuItem value="">Select Date</MenuItem>
              {/* Add date options here */}
            </Select>
          </FormControl>
        </Grid>

        {/* Add more fields here */}

        <Grid item xs={12}>
          <Button type="submit" variant="contained" color="primary">
            Submit
          </Button>
        </Grid>
      </Grid>
    </form>
  );
};

export default DataForm;
