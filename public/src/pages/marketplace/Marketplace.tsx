import React, { FC, useEffect, useState } from 'react';
import { Product } from '../../interfaces/Product';
import { getProducts, getLatestProducts } from '../../api/httpClient';
import Header from '../main/Header/Header';
import Testimonials from './Testimonials/Testimonials';
import ProductView from './ProductView';

interface Props {
  preview: boolean;
}

export const Marketplace: FC<Props> = (props: Props) => {
  const [products, setProducts] = useState<Array<Product>>([]);

  useEffect(() => {
    props.preview
      ? getLatestProducts().then((data) => setProducts(data))
      : getProducts().then((data) => setProducts(data));
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
            {products &&
              products.map((product, i) => (
                <ProductView product={product} key={i} />
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
