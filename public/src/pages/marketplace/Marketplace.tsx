import React, { ChangeEvent, FC, useEffect, useState } from 'react';
import { Product } from '../../interfaces/Product';
import {
  getProducts,
  getLatestProducts,
  putFile,
  getFile
} from '../../api/httpClient';
import Header from '../main/Header/Header';
import Testimonials from './Testimonials/Testimonials';
import ProductView from './ProductView';

interface Props {
  preview: boolean;
}
const path = process.env.NODE_ENV === 'production' ? '/home/node/' : '';

export const Marketplace: FC<Props> = (props: Props) => {
  const [products, setProducts] = useState<Array<Product>>([]);
  const [sendFileResult, setSendFileResult] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const sendFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file: File = (e.target.files as FileList)[0];
    putFile(`${path}${file.name}`, file).then((result) => {
      setSendFileResult(result);
      setFileName(file.name);
    });
  };

  const onGetFile = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    getFile(`${path}${fileName}`).then((blob) => {
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

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
      <section id="feedback" className="testimonials section-bg">
        <div className="container" data-aos="fade-up">
          <div className="section-title">
            <h2>feedback</h2>
            <span>Please, upload a feedback: </span>
            <label htmlFor="feedback-file-input" className="file-input-label">
              <img
                src={'assets/img/upload-file.svg'}
                alt=""
                className="upload-file-image"
              />
            </label>
            <input
              id="feedback-file-input"
              type="file"
              accept="file/*"
              style={{ display: 'none' }}
              onChange={sendFile}
            />
            {sendFileResult.length > 0 && (
              <>
                <div className="warning-text">{sendFileResult}</div>
                <div>
                  You can reach your file{' '}
                  <a href="#" onClick={onGetFile}>
                    here
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
};

export default Marketplace;
