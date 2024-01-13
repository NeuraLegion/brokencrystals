import React, { FC } from 'react';
import InnerHTML from 'dangerously-set-html-content';
import { Partner } from '../../../interfaces/Partner';

interface Props {
  partners: Array<Partner>
}

export const PartnersItems: FC<Props> = (props: Props) => {
  const { partners } = props;

  return (
    <>
      {partners.map((item, index) => (
        <div className="testimonial-item" key={item.name + index}>
          <p>
            <i className="bx bxs-quote-alt-left quote-icon-left" />
            <span className="dangerous-html">
              <InnerHTML html={item.profession} />
            </span>
            <i className="bx bxs-quote-alt-right quote-icon-right" />
          </p>
          <img
            src="assets/img/testimonials/testimonials-1.jpg"
            className="testimonial-img"
            alt=""
          />
          <h3 className="dangerous-html">
            <InnerHTML html={item.name} />
          </h3>
          <h4 className="dangerous-html">
            <InnerHTML html={item.residency} />
          </h4>
        </div>
      ))}
    </>
  );
};

export default PartnersItems;
