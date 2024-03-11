import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface DateRangePickerProps {
  onDatesChange: (dateFrom: Date, dateTo: Date) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ onDatesChange }) => {
  const [dates, setDates] = useState<{
    dateFrom: Date;
    dateTo: Date;
  }>({
    dateFrom: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
    dateTo: new Date()
  });

  const handleDateFromChange = (date: Date) => {
    setDates({ dateFrom: date, dateTo: dates.dateTo });
    onDatesChange(dates.dateFrom, dates.dateTo);
  };
  const handleDateToChange = (date: Date) => {
    setDates({ dateFrom: dates.dateFrom, dateTo: date });
    onDatesChange(dates.dateFrom, dates.dateTo);
  };

  return (
    <div className="col-lg-12 d-flex justify-content-center">
      <div className="input-group" style={{ width: '130px' }}>
        <DatePicker
          selected={dates.dateFrom}
          onChange={handleDateFromChange}
          selectsStart
          dateFormat="yyyy-MM-dd"
          className="form-control"
          placeholderText="Date From"
          excludeDateIntervals={[
            { start: dates.dateTo, end: new Date('02-05-2100') }
          ]}
          isClearable={false}
          closeOnScroll={true}
        />
      </div>
      <p style={{ padding: '8px' }}>-</p>
      <div className="input-group" style={{ width: '130px' }}>
        <DatePicker
          selected={dates.dateTo}
          onChange={handleDateToChange}
          selectsEnd
          dateFormat="yyyy-MM-dd"
          className="form-control"
          placeholderText="Date To"
          excludeDateIntervals={[
            { start: new Date('02-05-1970'), end: dates.dateFrom }
          ]}
          isClearable={false}
          closeOnScroll={true}
        />
      </div>
    </div>
  );
};

export default DateRangePicker;
