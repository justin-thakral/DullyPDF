import { useEffect, useState } from 'react';

type FormCatalogThumbnailProps = {
  thumbnailUrl: string;
  formNumber: string;
};

const FormCatalogThumbnail = ({ thumbnailUrl, formNumber }: FormCatalogThumbnailProps) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [thumbnailUrl]);

  return (
    <div className="form-catalog__card-thumb" aria-hidden="true">
      {failed ? (
        <span>{formNumber || 'PDF'}</span>
      ) : (
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
};

export default FormCatalogThumbnail;
