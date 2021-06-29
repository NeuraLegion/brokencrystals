import React, { FC } from 'react';
import { Crystal } from '../../interfaces/Crystal';

interface Props {
  crystal: Crystal;
}

export const CrystalView: FC<Props> = (props: Props) => {
  return (
    <div
      className={`col-lg-4 col-md-6 portfolio-item filter-${props.crystal.category}`}
      key={props.crystal.name}
    >
      <div className="portfolio-wrap">
        <img src={props.crystal.photoUrl} className="img-fluid" alt="" />
        <div className="portfolio-info">
          <h4>{props.crystal.name}</h4>
          <p>{props.crystal.short_description}</p>
        </div>
        <div className="portfolio-links">
          <a
            href={props.crystal.photoUrl}
            data-gall="portfolioGallery"
            className="venobox"
            title={props.crystal.name}
          >
            <i className="bx bx-plus" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default CrystalView;
