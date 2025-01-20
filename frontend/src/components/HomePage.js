import React from 'react';
import { Typography, Box, Button } from '@mui/material';
import { Link } from 'react-router-dom';

const HomePage = () => {
  return (
    <Box 
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        textAlign: 'center',
        padding: 2,
      }}
    >
      <Typography variant="h3" component="h1" gutterBottom>
        Welcome to the InsightsMix
      </Typography>
      <Typography variant="body1" gutterBottom>
        Click the button below to login.
      </Typography>
      <Button 
        component={Link} 
        to="/login" 
        variant="contained" 
        color="primary"
        sx={{ marginTop: 2 }}
      >
        Login
      </Button>
    </Box>
  );
};

export default HomePage;
