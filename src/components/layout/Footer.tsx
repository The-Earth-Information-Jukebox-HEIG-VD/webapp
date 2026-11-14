import { useTranslation } from 'react-i18next';
import './Footer.css';

/**
 * Footer component with credits and data source information
 */
export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="footer" role="contentinfo">
      <div className="footer-container">
        <div className="footer-content">
          <p className="footer-credits">{t('footer.credits')}</p>
          <p className="footer-data-source">{t('footer.dataSource')}</p>
        </div>
        <div className="footer-links">
          <a
            href="https://www.nasa.gov/goddard"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            NASA Goddard
          </a>
          <span className="footer-separator" aria-hidden="true">|</span>
          <a
            href="https://data.giss.nasa.gov/gistemp/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            GISTEMP
          </a>
          <span className="footer-separator" aria-hidden="true">|</span>
          <a
            href="https://gpm.nasa.gov/data/imerg"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            GPM IMERG
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
