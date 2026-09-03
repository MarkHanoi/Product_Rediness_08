class DescriptorInvariantError extends Error {
  constructor(message) {
    super(message);
    this.name = "DescriptorInvariantError";
  }
}

export { DescriptorInvariantError as D };
