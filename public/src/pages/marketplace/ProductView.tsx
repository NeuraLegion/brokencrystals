import React, { FC } from 'react';
import { Product } from '../../interfaces/Product';

interface Props {
  product: Product;
}

export const ProductView: FC<Props> = (props: Props) => {
  return (
    <div
      className={`col-lg-4 col-md-6 portfolio-item filter-${props.product.category}`}
      key={props.product.name}
    >
      <div className="portfolio-wrap">
        <img src={props.product.photoUrl} className="img-fluid" alt="" />
        <div className="portfolio-info">
          <h4>{props.product.name}</h4>
          <p>{props.product.description}</p>
        </div>
        <div className="portfolio-links">
          <a
            href={props.product.photoUrl}
            data-gall="portfolioGallery"
            className="venobox"
            title={props.product.name}
          >
            <i className="bx bx-plus" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default ProductView;
