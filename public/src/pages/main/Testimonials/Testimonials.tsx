import React, { FC, useEffect, useState } from 'react';
import { getTestimonials, getTestimonialsCount } from '../../../api/httpClient';
import { Testimonial } from '../../../interfaces/Testimonial';
import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';
import TestimonialsForm from './TestimonialsForm';

const testimonialsItems = (testimonials: Array<Testimonial>) => (
  <>
    {testimonials.map((item, index) => (
      <div className="testimonial-item" key={item.name + index}>
        <p>
          <i className="bx bxs-quote-alt-left quote-icon-left" />
          <span dangerouslySetInnerHTML={{ __html: item.message }} />
          <i className="bx bxs-quote-alt-right quote-icon-right" />
        </p>
        <img
          src="assets/img/testimonials/testimonials-1.jpg"
          className="testimonial-img"
          alt=""
        />
        <h3 dangerouslySetInnerHTML={{ __html: item.name }} />
        <h4 dangerouslySetInnerHTML={{ __html: item.title }} />
      </div>
    ))}
  </>
);

export const Testimonials: FC = () => {
  const [testimonials, setTestimonials] = useState<Array<Testimonial>>([]);
  const [newTestimonial, setNewTestimonial] = useState<any>();
  const [testimonialsCount, setTestimonialsCount] = useState<number>(0);

  useEffect(() => {
    getTestimonials().then((data) => setTestimonials(data));
    getTestimonialsCount().then((data) => setTestimonialsCount(data));
  }, []);

  useEffect(() => {
    if (newTestimonial) {
      setTestimonials([...testimonials, newTestimonial]);
      getTestimonialsCount().then((data) => setTestimonialsCount(data));
    }
  }, [newTestimonial]);

  return (
    <section id="testimonials" className="testimonials section-bg">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Testimonials ({testimonialsCount})</h2>
          <p>
            Magnam dolores commodi suscipit. Necessitatibus eius consequatur ex
            aliquid fuga eum quidem. Sit sint consectetur velit. Quisquam quos
            quisquam cupiditate. Et nemo qui impedit suscipit alias ea. Quia
            fugiat sit in iste officiis commodi quidem hic quas.
          </p>
        </div>

        {testimonials?.length ? (
          <OwlCarousel className="owl-carousel" dots>
            {testimonialsItems(testimonials)}
          </OwlCarousel>
        ) : null}
      </div>

      <TestimonialsForm setNewTestimonial={setNewTestimonial} />
    </section>
  );
};

export default Testimonials;
