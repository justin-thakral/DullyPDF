import './PublicVideoPanel.css';

export type PublicVideoPanelProps = {
  eyebrow?: string;
  title: string;
  description: string;
  videoId: string;
  youtubeUrl: string;
  durationLabel?: string;
  caption?: string;
};

const buildEmbedSrc = (videoId: string): string => (
  `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`
);

const PublicVideoPanel = ({
  eyebrow = 'Video walkthrough',
  title,
  description,
  videoId,
  youtubeUrl,
  durationLabel,
  caption,
}: PublicVideoPanelProps) => (
  <section className="public-video-panel">
    <div className="public-video-panel__layout">
      <div className="public-video-panel__copy">
        <p className="public-video-panel__eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="public-video-panel__meta">
          {durationLabel ? <span className="public-video-panel__duration">{durationLabel}</span> : null}
          <a href={youtubeUrl} target="_blank" rel="noreferrer">
            Watch on YouTube
          </a>
        </div>
      </div>

      <div className="public-video-panel__frame">
        <div className="public-video-panel__embed">
          <iframe
            src={buildEmbedSrc(videoId)}
            title={title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
    </div>

    {caption ? <p className="public-video-panel__caption">{caption}</p> : null}
  </section>
);

export default PublicVideoPanel;
