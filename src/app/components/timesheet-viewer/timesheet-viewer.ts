  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek'
    },
    // Mobile responsive settings
    windowResize: (view) => {
      // Detect mobile size and adjust views
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        // Simplified toolbar on mobile
        this.calendarOptions.headerToolbar = {
          left: 'prev,next',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek'
        };
      } else {
        // Full toolbar on desktop
        this.calendarOptions.headerToolbar = {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek'
        };
      }
    },
