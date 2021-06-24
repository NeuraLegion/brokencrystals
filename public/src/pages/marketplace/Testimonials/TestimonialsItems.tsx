import React, { FC } from 'react';
import InnerHTML from 'dangerously-set-html-content';
import { Testimonial } from '../../../interfaces/Testimonial';

interface Props {
  testimonials: Array<Testimonial>;
}

export const TestimonialsItems: FC<Props> = (props: Props) => {
  const { testimonials } = props;
  return (
    <>
      {testimonials.map((item, index) => (
        <div className="testimonial-item" key={item.name + index}>
          <p>
            <i className="bx bxs-quote-alt-left quote-icon-left" />
            <span className="dangerous-html">
              <InnerHTML html={item.message} />
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
            <InnerHTML html={item.title} />
          </h4>
        </div>
      ))}
    </>
  );
};

export default TestimonialsItems;
