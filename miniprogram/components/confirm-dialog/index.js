Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    lines: { type: Array, value: [] }
  },

  methods: {
    onCancel() {
      this.triggerEvent('cancel');
    },

    onConfirm() {
      this.triggerEvent('confirm');
    },

    preventTouchMove() {}
  }
});