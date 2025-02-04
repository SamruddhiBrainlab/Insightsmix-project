import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Container, Typography, Paper, Box, CircularProgress} from '@mui/material';

const UserGuide = () => {
  const [markdownContent, setMarkdownContent] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMarkdown = async () => {
    try {
      const response = await fetch('/docs/user-guide.md');
      const text = await response.text();
      setMarkdownContent(text);
    } catch (error) {
      console.error('Error fetching markdown:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkdown();
  }, []);

  return (
    <Container maxWidth="lg" sx={{ marginTop: 4 }}>
      <Paper sx={{ padding: 5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
            <ReactMarkdown
            children={markdownContent}
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({node, ...props}) => <Typography variant="h4" gutterBottom sx={{ fontFamily: 'Google Sans', color: 'rgba(0, 0, 0, 0.7)'}} {...props} />,
              h2: ({node, ...props}) => <Typography variant="h5" gutterBottom sx={{ fontFamily: 'Google Sans', color: 'rgba(0, 0, 0, 0.7)'}} {...props} />,
              h3: ({node, ...props}) => <Typography variant="h6" gutterBottom sx={{ fontFamily: 'Google Sans', color: 'rgba(0, 0, 0, 0.7)'}} {...props} />,
              p: ({node, ...props}) => <Typography paragraph {...props} />,
              ul: ({node, ...props}) => (
                <Box component="ul" sx={{ paddingLeft: 2 }}>
                  <Typography component="li" sx={{ fontFamily: 'Google Sans', color: 'rgba(0, 0, 0, 0.7)'}} {...props} />
                </Box>
              ),
              ol: ({node, ...props}) => (
                <Box component="ol" sx={{ paddingLeft: 2 }}>
                  <Typography component="li" {...props} />
                </Box>
              ),
              a: ({node, ...props}) => <Typography component="a" color="primary" {...props} />,
              table: ({node, ...props}) => (
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0' }} {...props} />
              ),
              tr: ({node, ...props}) => <Box component="tr" sx={{ borderBottom: '1px solid #ddd' }} {...props} />,
              th: ({node, ...props}) => (
                <Box component="th" sx={{ padding: '8px', backgroundColor: '#f2f2f2' }} {...props} />
              ),
              td: ({node, ...props}) => <Box component="td" sx={{ padding: '8px' }} {...props} />,
            }}
          />
          
        )}
      </Paper>
    </Container>
  );
};

export default UserGuide;
