import React, { useState, useEffect } from 'react';
import { Avatar } from '@mui/material';
import { User } from 'lucide-react';
import { styled } from '@mui/material/styles';

const StyledAvatar = styled(Avatar)({
  width: 40,
  height: 40
});

const ProfileImage = ({ src, alt, className }) => {
  const [imageError, setImageError] = useState(false);
  const [imageSrc, setImageSrc] = useState(src);

  useEffect(() => {
    if (!src) {
      setImageError(true);
      return;
    }

    // Reset error state when src changes
    setImageError(false);
    setImageSrc(src);

    // Preload image
    const img = new Image();
    
    img.onload = () => {
      setImageSrc(src);
      setImageError(false);
    };

    img.onerror = () => {
      // If the image fails to load, try loading it again with a cache-busting query parameter
      const retryUrl = `${src}${src.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
      const retryImg = new Image();
      
      retryImg.onload = () => {
        setImageSrc(retryUrl);
        setImageError(false);
      };
      
      retryImg.onerror = () => {
        setImageError(true);
        console.warn('Image failed to load after retry:', src);
      };
      
      retryImg.src = retryUrl;
    };

    img.src = src;

    // Cleanup
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return (
    <StyledAvatar 
      className={className}
      sx={{
        bgcolor: imageError ? 'grey.200' : 'transparent',
        '& img': {
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }
      }}
    >
      {!imageError ? (
        <img
          src={imageSrc}
          alt={alt}
          onError={(e) => {
            console.warn('Image render error:', e);
            setImageError(true);
          }}
          crossOrigin="anonymous"
          loading="eager"
          referrerPolicy="no-referrer"
        />
      ) : (
        <User 
          size={24}
          style={{ color: '#666' }}
        />
      )}
    </StyledAvatar>
  );
};

export default ProfileImage;