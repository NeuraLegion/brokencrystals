import React, { FC, useEffect, useState } from 'react';
import { Crystal } from '../../interfaces/Crystal';
import { getLatestCrystals } from '../../api/httpClient';

export const Marketplace: FC = () => {
  const [crystals, setCrystals] = useState<Array<Crystal>>([]);

  useEffect(() => {
    getLatestCrystals().then((data) => setCrystals(data));
  }, []);

  return (
    <section id="marketplacePreview" className="portfolio">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Latest Products</h2>
        </div>

        <div className="row portfolio-container">
          {crystals.map((crystal) => (
            <div
              className={`col-lg-4 col-md-6 portfolio-item filter-${crystal.category}`}
              key={crystal.name}
            >
              <div className="portfolio-wrap">
                <img src={crystal.photo_URL} className="img-fluid" alt="" />
                <div className="portfolio-info">
                  <h4>{crystal.name}</h4>
                  <p>{crystal.short_description}</p>
                </div>
                <div className="portfolio-links">
                  <a
                    href={crystal.photo_URL}
                    data-gall="portfolioGallery"
                    className="venobox"
                    title={crystal.name}
                  >
                    <i className="bx bx-plus" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="section-readmore">
          <a href="/marketplace">
            <p>See all products</p>
          </a>
        </div>
      </div>
    </section>
  );
};

export default Marketplace;
