import React, { FC } from 'react';
import { getProducts } from './getProducts';

const products = getProducts();

export const Marketplace: FC = () => {
  return (
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
          {products.map((product) => (
            <div
              className={`col-lg-4 col-md-6 portfolio-item filter-${product.category.name}`}
              key={product.name}
            >
              <div className="portfolio-wrap">
                <img src={product.photos[0].url} className="img-fluid" alt="" />
                <div className="portfolio-info">
                  <h4>{product.name}</h4>
                  <p>{product.short_description}</p>
                </div>
                <div className="portfolio-links">
                  <a
                    href={product.photos[0].url}
                    data-gall="portfolioGallery"
                    className="venobox"
                    title={product.name}
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
  );
};

export default Marketplace;
