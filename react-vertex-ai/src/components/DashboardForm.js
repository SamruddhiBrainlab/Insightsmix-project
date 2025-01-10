import React from "react";
import {
  Box,
  Paper,
  Grid,
  TextField,
  MenuItem,
  Button,
  Typography,
  styled,
  useTheme,
  useMediaQuery,
} from "@mui/material";

// Styled components
const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  margin: theme.spacing(3),
  backgroundColor: "#fff",
  borderRadius: "8px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
}));

const FormLabel = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(1),
  fontSize: "0.750rem",
  fontWeight: 500,
  "& .required": {
    color: theme.palette.error.main,
    marginLeft: "2px",
  },
}));

const DashboardForm = () => {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));

  // Sample data for dropdowns
  const granularityOptions = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  const dateOptions = [
    { value: "last7", label: "Last 7 days" },
    { value: "last30", label: "Last 30 days" },
    { value: "custom", label: "Custom Range" },
  ];

  const currencyOptions = [
    { value: "usd", label: "USD" },
    { value: "eur", label: "EUR" },
    { value: "gbp", label: "GBP" },
  ];

  return (
    <Box sx={{ flexGrow: 1, padding: 2, paddingBottom: 4 }}>
      <StyledPaper>
        <Grid
          container
          spacing={isSmallScreen ? 2 : 3}
          justifyContent="space-between"
        >
          {/* Left Column */}
          <Grid item xs={12} md={6}>
            {/* Data Source */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Data Source<span className="required">*</span>
              </FormLabel>
              <Box sx={{ display: "flex", gap: 1, flexDirection: isSmallScreen ? "column" : "row" }}>
                <TextField
                  fullWidth
                  disabled
                  placeholder="No data added"
                  size="small"
                  sx={{ backgroundColor: "#fff" }}
                />
                <Button
                  variant="contained"
                  sx={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    backgroundColor: "#f5f5f5",
                    color: "#000",
                    height: "40px",
                    textTransform: "none",
                    "&:hover": {
                      backgroundColor: "#e0e0e0",
                    },
                  }}
                >
                  Import data
                </Button>
              </Box>
            </Box>

            {/* Project Name */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Project Name<span className="required">*</span>
              </FormLabel>
              <TextField
                fullWidth
                placeholder="New Project Name"
                size="small"
                sx={{ backgroundColor: "#fff" }}
              />
            </Box>

            {/* Data Granularity */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Data Granularity<span className="required">*</span>
              </FormLabel>
              <TextField
                select
                fullWidth
                defaultValue=""
                size="small"
                sx={{ backgroundColor: "#fff" }}
              >
                {granularityOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Target Selector */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Target Selector<span className="required">*</span>
              </FormLabel>
              <TextField
                select
                fullWidth
                defaultValue=""
                size="small"
                sx={{ backgroundColor: "#fff" }}
              >
                <MenuItem value="target1">Target 1</MenuItem>
                <MenuItem value="target2">Target 2</MenuItem>
              </TextField>
            </Box>
          </Grid>

          {/* Right Column */}
          <Grid item xs={12} md={6}>
            {/* Date Selector */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Date Selector<span className="required">*</span>
              </FormLabel>
              <TextField
                select
                fullWidth
                defaultValue=""
                size="small"
                sx={{ backgroundColor: "#fff" }}
              >
                {dateOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Investment Selector */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Investment Selector<span className="required">*</span>
              </FormLabel>
              <TextField
                select
                fullWidth
                defaultValue=""
                size="small"
                sx={{ backgroundColor: "#fff" }}
              >
                <MenuItem value="inv1">Investment 1</MenuItem>
                <MenuItem value="inv2">Investment 2</MenuItem>
              </TextField>
            </Box>

            {/* Currency Selector */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Currency Selector<span className="required">*</span>
              </FormLabel>
              <TextField
                select
                fullWidth
                defaultValue=""
                size="small"
                sx={{ backgroundColor: "#fff" }}
              >
                {currencyOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Target Type Selector */}
            <Box sx={{ mb: isSmallScreen ? 2 : 3 }}>
              <FormLabel>
                Target Type Selector<span className="required">*</span>
              </FormLabel>
              <TextField
                select
                fullWidth
                defaultValue=""
                size="small"
                sx={{ backgroundColor: "#fff" }}
              >
                <MenuItem value="type1">Type 1</MenuItem>
                <MenuItem value="type2">Type 2</MenuItem>
              </TextField>
            </Box>
          </Grid>
        </Grid>

        {/* Submit Button */}
        <Box sx={{ mt: 3, textAlign: isSmallScreen ? "center" : "left" }}>
          <Button
            variant="contained"
            sx={{
              backgroundColor: "#fcd535",
              color: "#000",
              border: "1px solid #000",  // Add black border
              borderRadius: "30px",      // Make corners more circular
              "&:hover": {
                backgroundColor: "#fccd17",
                border: "2px solid #000", // Keep the border on hover
              },
              px: 4,
              py: 0.5,
            }}
          >
            Submit
          </Button>

        </Box>
      </StyledPaper>
    </Box>
  );
};

export default DashboardForm;
