import React, { FC, useEffect, useState } from 'react';
import { Crystal } from '../../interfaces/Crystal';
import { getCrystals, getLatestCrystals } from '../../api/httpClient';
import Header from '../main/Header/Header';
import Testimonials from './Testimonials/Testimonials';
import CrystalView from './CrystalView';

interface Props {
  preview: boolean;
}

export const Marketplace: FC<Props> = (props: Props) => {
  const [crystals, setCrystals] = useState<Array<Crystal>>([]);

  useEffect(() => {
    props.preview
      ? getLatestCrystals().then((data) => setCrystals(data))
      : getCrystals().then((data) => setCrystals(data));
  }, []);

  return (
    <>
      {props.preview || <Header onInnerPage={true} />}

      <section id="marketplace" className="portfolio">
        <div className="container" data-aos="fade-up">
          <div className="section-title marketplaceTitle">
            <h2>Marketplace</h2>
          </div>
          {props.preview || (
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
          )}
          <div className="row portfolio-container">
            {crystals.map((crystal, i) => (
              <CrystalView crystal={crystal} key={i} />
            ))}
          </div>
        </div>
        {props.preview && (
          <div className="section-readmore">
            <a href="/marketplace">
              <span>See all products</span>
            </a>
          </div>
        )}
      </section>

      <Testimonials preview={props.preview} />
    </>
  );
};

export default Marketplace;
