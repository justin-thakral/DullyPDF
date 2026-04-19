import { useState } from 'react';

type FormCatalogThumbnailProps = {
  thumbnailUrl: string;
  formNumber: string;
  title?: string;
};

const buildAltText = (formNumber: string, title?: string) => {
  // Meaningful alt for SEO + Google Image search. Form number + title gives
  // context that's not redundant with the surrounding card text (the card
  // shows them separately; the alt joins them in one searchable string).
  if (formNumber && title) {
    return `${formNumber} fillable PDF — first page preview of ${title}`;
  }
  if (title) {
    return `${title} fillable PDF — first page preview`;
  }
  if (formNumber) {
    return `${formNumber} fillable PDF — first page preview`;
  }
  return 'Fillable PDF form preview';
};

const FormCatalogThumbnail = ({ thumbnailUrl, formNumber, title }: FormCatalogThumbnailProps) => {
  const [failed, setFailed] = useState(false);
  // Reset the failed flag when the thumbnail URL changes. React's officially
  // supported "adjust state when prop changes" pattern (preferred over a
  // useEffect/setState combo, which the react-hooks lint rule flags).
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [trackedUrl, setTrackedUrl] = useState(thumbnailUrl);
  if (thumbnailUrl !== trackedUrl) {
    setTrackedUrl(thumbnailUrl);
    setFailed(false);
  }

  const altText = buildAltText(formNumber, title);

  return (
    <div className="form-catalog__card-thumb">
      {failed ? (
        <span aria-hidden="true">{formNumber || 'PDF'}</span>
      ) : (
        <img
          src={thumbnailUrl}
          alt={altText}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
};

export default FormCatalogThumbnail;
