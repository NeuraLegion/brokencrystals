import React, { FC, useEffect, useState } from 'react';
import { Crystal } from '../../interfaces/Crystal';
import { getCrystals } from '../../api/httpClient';
import Header from '../main/Header/Header';

export const Marketplace: FC = () => {
  const [crystals, setCrystals] = useState<Array<Crystal>>([]);

  useEffect(() => {
    getCrystals().then((data) => setCrystals(data));
  }, []);

  return (
    <>
      <Header onInnerPage={true} />

      <section id="marketplace" className="portfolio">
        <div className="container" data-aos="fade-up">
          <div className="section-title">
            <h2>Marketplace</h2>
          </div>

          <div className="row">
            <div className="col-lg-12 d-flex justify-content-center">
              <ul id="portfolio-flters">
                <li data-filter="*" className="filter-active">
                  All
                </li>
                <li data-filter=".filter-Healing">Healing</li>
                <li data-filter=".filter-Jewellery">Jewellery</li>
                <li data-filter=".filter-Gemstones">Gemstones</li>
              </ul>
            </div>
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
        </div>
      </section>
    </>
  );
};

export default Marketplace;
